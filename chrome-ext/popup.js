function renderStatus(statusText) {
	document.getElementById('status').innerHTML = statusText;
}

//required.
function log_image() {};

function displayResults(phinnResults) {


		var result = phinnResults.suspicious ? phinnResults.result : phinnResults.results[0];

		//set source image. 
		console.log('wat');
		console.log(phinnResults);
		document.getElementById("source-rect-img").src = result.cleanImage;

		// add marked up image to results.
		var markedImg = document.createElement("img");
		markedImg.src = result.markedImage;
		//markedImage.style.border = 1;

		document.getElementById("results").appendChild(markedImg);

	var status_txt ="Processing took " + phinnResults.totalTime.toFixed(1) + "ms";
	if(phinnResults.suspicious) {
		status_txt += "<br/><b>This looks like a " + phinnResults.top.label.fullname.toUpperCase() + " page to me!</b>";
	}
	else {
		status_txt += "<br/><i>Im not sure what this is...</i>";
	}
	 document.getElementById('source-rect').removeAttribute('hidden');
	renderStatus(status_txt);
}

document.addEventListener('DOMContentLoaded', function () {
	document.getElementById('source-rect-link').addEventListener('click', function() {
		var srcImg = document.getElementById('source-rect-img').removeAttribute('hidden');
	});
});

window.addEventListener('DOMContentLoaded', function() {

	// get current tab.
	chrome.tabs.query({active: true,currentWindow: true}, function (tabs) {
		// save current zoom level.
		chrome.tabs.getZoom(tabs[0].id, function(zoomLevel) {
			// make sure we're being scaled at 100%.
			chrome.tabs.setZoom(tabs[0].id, 1.0, function() {
				// perform anaylsis
				chrome.tabs.sendMessage(tabs[0].id, {from: 'popup', subject: 'DOMInfo'}, function(result) {
					var pwrects = result.pwgeometries;

					if(pwrects.length === 0) {
						renderStatus("no password fields. Ignoring.");
						return;
					} 
					console.log('running from popup');

					runPhinnAnalysis(pwrects, {tabId: tabs[0].id, zoomLevel: zoomLevel}, tabs[0].windowId, function(results) {
						displayResults(results);
					});
				});
			});
		});
	});
});


