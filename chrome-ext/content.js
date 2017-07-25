var PHINN_DEBUG = true;

function log(status) {
	if(PHINN_DEBUG) {
		console.log(status);
	}
}
function log_image(img) {
	if(PHINN_DEBUG) {
		console.image(img);
	}
}

function inputToRect(input) {
	var boundingRect = input.getBoundingClientRect();
	var d = {
			top : boundingRect.top,
			bottom : boundingRect.bottom,
			left : boundingRect.left,
			right : boundingRect.right,
			width : boundingRect.width,
			height: boundingRect.height
	}
	return d;
}

function isElementVisible(element)  {
	var d = inputToRect(element);
	var centerX = d.left + (d.right - d.left)/2 
	var centerY = d.bottom + (d.top - d.bottom)/2
	var visible = element == document.elementFromPoint(centerX, centerY);
	return visible && (!(d.top == 0 && d.bottom == 0 && d.left == 0 && d.right == 0));
}

function getGeometryList() {
	var geometry = [];
	var hiddenpw = false;
	var inputs = document.querySelectorAll('input');

	//pass 1 find pw fields.
	for(let input of inputs) {
		if (input.type.toLowerCase() === "password") {

			if (!isElementVisible(input)) {
				hiddenpw = true;
				continue;
			}
			geometry.push(inputToRect(input));
		}
	}
	//pass 2 (only if pw field is hidden and we didn't find a visible one)
	//if we have a hidden PW field we should check for email fields instead.
	if(hiddenpw && geometry.length === 0) { 
		for (let input of inputs) {
			if(input.type.toLowerCase() === "email") {
				if (!isElementVisible(input)) {
					continue;
				}
				geometry.push(inputToRect(input));
			}
		} 
	}
	return geometry;
}

function getModalTemplate(callback) {
	var xhr = new XMLHttpRequest();
	xhr.onreadystatechange = function() {
		if(xhr.readyState == 4 && xhr.status == 200) {
			callback(xhr.responseText);
		}
	}
	xhr.open("GET", chrome.extension.getURL('modal_template.html'), true);
	xhr.send();
}


function checkBlockUser(phinnResults) {

	if(!phinnResults.suspicious) {
		return;
	}

	var domainMatch = false;
	for(let domain of phinnResults.top.label.domains) {
		if(document.domain.toLowerCase() === domain.toLowerCase()) {
			domainMatch = true;
			break;
		}
	}

	if(domainMatch) {
		log('domain validated.');
		return;
	}

	log("blocking user.");
	getModalTemplate(function(template) {


		var container = document.createElement("div");
		container.innerHTML = template.replace('{label}', phinnResults.top.label.fullname.toUpperCase());
		document.body.appendChild(container);

		var modal = document.getElementById('phinn_modal');

		modal.getElementsByClassName("phinn-close")[0].onclick = function() {
			modal.style.display = "none";
		}


		var results_div = document.getElementById("phinn_results");
		var markedImage = document.createElement("img"); 
		markedImage.src = phinnResults.result.markedImage;
		results_div.appendChild(markedImage);

		//show modal
		modal.style.display = 'block';

	});
}

function WaitForDomToSettle(timeout, interval, callback) {

	log("Waiting for dom to settle.");
	var domChanged = false;
	var start = Date.now();
	var obs = new MutationObserver(function (mutations, observer) {
		log("dom changed");
		domChanged = true;
	});
	
	obs.observe(document.body,{ childList: true, subtree: true, attributes: true, characterData: true });


	setTimeout(function checkDomChanged() {

		if(domChanged && Date.now() - start < timeout) {
			log("dom changed this tick. waiting...");
			domChanged = false;
			setTimeout(checkDomChanged, interval);
			return;
		}
		log("dom settled in " + (Date.now() - start));
		obs.disconnect();
		callback();
	}, interval);
}

function DoPhinnAnalysis(tabData, callback) {
	
	//the page might still be loading so we want to wait for the dom to settle down.
	WaitForDomToSettle(1000, 150, function() {
		//at entry we assume the page has already been scaled to 1.0x from the background thread.
		var geometry = getGeometryList();
		if(geometry.length > 0) {
			
			log('got geometry for Analysis start:');
			log(geometry);
			
			
			//enable the extension button
			chrome.runtime.sendMessage({from : 'content',subject : 'showPageAction'});

			//run the analysis
			chrome.runtime.sendMessage({from : 'content',subject : 'runAnalysis', geometry: geometry, tabData: tabData}, function(response) {
				log("Analysis result:");
				log(response);
				checkBlockUser(response);

				if(callback != undefined) {
					callback();
				}
			});
		}
	});
}

chrome.runtime.onMessage.addListener(function(msg, sender, response) {
	if ((msg.from === 'popup' || msg.from === 'background') && (msg.subject === 'DOMInfo')) {
		var geometry = getGeometryList();
		
		log('got geometry for DOMInfo response');
		log(geometry);
		
		var domInfo = { pwgeometries : geometry };
		response(domInfo);
	}
	else if (msg.from === 'background' && msg.subject === 'Log') {
		console.log(msg.data);
	}
	else if (msg.from === 'background' && msg.subject === 'LogImage') {
		log_image(msg.data);
	}
	else if(msg.from === 'background' && msg.subject === 'BeginAnalysis') {
		DoPhinnAnalysis(msg.tabData);
	}
	else {
		log(msg);
	}		
});

window.addEventListener("load", function loadcb(event) {
	log("page loaded.");
	window.removeEventListener("load", loadcb, false);
	
	chrome.runtime.sendMessage({from : 'content',subject : 'PageLoaded'});

}, false);