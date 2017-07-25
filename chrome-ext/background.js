
var PHINN_DEBUG = false;

function log(tabId, status) {
	if(PHINN_DEBUG) {
		chrome.tabs.sendMessage(tabId, {from : 'background', subject : 'Log', data: status});  
	}
}
function logbg(status) {
	if(PHINN_DEBUG) {
		console.log(status);
	}
}

function beginAnalysis(tabId) {

	//get zoom level.
	chrome.tabs.getZoom(tabId, function(zoomLevel) {

		log(tabId, 'tab zoom: ' + zoomLevel);
		if(zoomLevel != 1.0) {

			//if we're not at 1x scale we should check to see if there is any valid dom info before doing anythis disruptive like rescaling. 
			chrome.tabs.sendMessage(tabId, {from : 'background', subject : 'DOMInfo'}, function(domInfo) {  
				if(domInfo.pwgeometries.length > 0) {
					//Yes we are interested in a picture of the content. Go ahead and resize before running analysis.
					chrome.tabs.setZoom(tabId, 1.0, function() {
						chrome.tabs.sendMessage(tabId, {from : 'background', subject : 'BeginAnalysis', tabData: {zoomLevel: zoomLevel, tabId: tabId}});
					});
				}
			});
		}
		else {
			chrome.tabs.sendMessage(tabId, {from : 'background', subject : 'BeginAnalysis', tabData: { tabId: tabId }});	
		}


	});
}

chrome.runtime.onMessage.addListener(function (msg, sender, response) {
	if ((msg.from === 'content') && (msg.subject === 'showPageAction')) {
		chrome.pageAction.show(sender.tab.id);
	}
	else if ((msg.from === 'content') && (msg.subject === 'runAnalysis')) {
		logbg("starting analysis...");
		runPhinnAnalysis(msg.geometry, msg.tabData, sender.tab.windowId, function(results) {
			response(results);
		});
		return true;
	}
	else if(msg.from === 'content' && msg.subject === 'PageLoaded') {
		chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
			if(tabs[0].id === sender.tab.id) {
				beginAnalysis(tabs[0].id);
			}
			else {
				log(sender.tab.id, "waiting for activation " + sender.tab.id);
				chrome.tabs.onActivated.addListener(function listener(activeInfo) {
					if(activeInfo.tabId === sender.tab.id && activeInfo.windowId === sender.tab.windowId) {
						logbg("tab "+ sender.tab.id +" now active!");
						beginAnalysis(activeInfo.tabId);
						chrome.tabs.onActivated.removeListener(listener);
					}
				});
			}
		});
	}
});
logbg("background registered.");