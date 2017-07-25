var valid_threshold = 0.5; //what NN label confidence threshold is considered valid.
var min_hits = 3; //Minimum number of NN label hits for a login page to match a label. 
var slice_size = 96;
var capture_scale = 0.5;
var x_offset = (slice_size * 2 + 1) / capture_scale;
var y_offset = (slice_size * 2 + 1) / capture_scale;

function getNetworkJson(callback) {
	var xhr = new XMLHttpRequest();
	xhr.onreadystatechange = function() {
		if(xhr.readyState == 4 && xhr.status == 200) {
			callback(xhr.responseText);
		}
	}
	xhr.open("GET", chrome.extension.getURL('network.json'), true);
	xhr.send();
}

function getNetworkInstance(callback) {

	return getNetworkJson(function(json){

		jsnet = JSON.parse(json);

		var net = new convnetjs.Net();
		net.fromJSON(jsnet.network);

		callback(net, jsnet.labels);
	});
}

function image_data_to_volume(image_data) {
	var p = image_data.data;
	var pv = []

	for(var i=0;i<p.length;i++) {
		pv.push((p[i]/255.0)-0.5); // normalize image pixels to [-0.5, 0.5]
	}
	
	var x = new convnetjs.Vol(image_data.width, image_data.height, 4, 0.0); //input volume (image)

	x.w = pv;
	return x;
}


//handle hidpi displays
function processDevicePixelRatio(image, callback) {
	if(window.devicePixelRatio && window.devicePixelRatio != 1) {
		var tmpcanvas = document.createElement("canvas");
		tmpcanvas.width = image.width / window.devicePixelRatio;
		tmpcanvas.height = image.height / window.devicePixelRatio;
		var tctx = tmpcanvas.getContext("2d");
		tctx.imageSmoothingQuality = "high";
		tctx.scale(1.0/window.devicePixelRatio, 1.0/window.devicePixelRatio);
		tctx.drawImage(image, 0, 0);
		tctx.scale(1.0,1.0);

		var newimg = new Image();
		newimg.onload = function() {callback(newimg);};
		newimg.src = tmpcanvas.toDataURL();
	}
	else {
		callback(image);
	}
}

function getScreenshotImage(windowId, callback) {
	chrome.tabs.captureVisibleTab(windowId, {"quality": 100, "format" : "png"}, function (dataUrl) {
		var image = new Image();
		if(typeof(dataUrl) !== "undefined") {
			image.onload = function() {
				processDevicePixelRatio(image, callback);
			}
			image.src = dataUrl;
		}
	});
}


function renderImageAtScaleOnCanvas(image, canvas, capture_scale) {
	
	canvas.width = Math.floor(image.width * capture_scale);
	canvas.height = Math.floor(image.height * capture_scale);
	var context = canvas.getContext("2d");

	context.imageSmoothingQuality = "high";
	context.scale(capture_scale, capture_scale);
	context.drawImage(image, 0, 0)
	context.scale(1.0,1.0);

	return context;
}

function sliceCanvas(canvas,xystep,cb) {
	var start = performance.now();
	var ctx = canvas.getContext("2d");
	for(var x=0;x<=canvas.width-xystep;x+=xystep) {
		for(var y=0;y<=canvas.height-xystep;y+=xystep) {
			cb(x,y,ctx.getImageData(x,y,xystep,xystep));
		}
	}
	return performance.now() - start;
}

function evaluate_activation(activations, labels) {
	var preds = [];
	for(var k=0;k<activations.w.length;k++) { preds.push({k:k,p:activations.w[k]}); }
	preds.sort(function(a,b){return a.p<b.p ? 1:-1;});

	return  {
		label:labels[preds[0].k],
		confidence:preds[0].p
	}
}

function get_label_for_id(labelid, labels) {
	for(let label of labels) {
		if(label.id === labelid) {
			return label;
		}
	}
	return null;
}


function getSlicableImage(rect, canvas) {
	
	var sx = canvas.width;
	var sy = canvas.height;
	
	var cx = (rect.left + rect.width/2.0) * capture_scale;
	var cy = (rect.top + rect.height/2.0) * capture_scale;
	
	
	var idealwidth = (rect.width + 2.0*x_offset)*capture_scale;
	var idealheight = (rect.height + 2.0*y_offset)*capture_scale;
	
	//bound to 9x9 grid max
	idealwidth = Math.min(idealwidth, slice_size*3);
	idealheight = Math.min(idealheight, slice_size*3);
	
	//compute virtual iamge that can go beyond image bounds.
	var virtualtop = cy - idealheight/2;
	var virtualleft = cx - idealwidth/2;
	var virtualbottom = cy + idealheight/2;
	var virtualright = cx + idealwidth/2;
	
	
	
	//adjust horiz span if login form is right against the sides.
	if(virtualright > sx) {
		var diff = virtualright - sx;
		virtualright = sx;
		virtualleft -= diff;
	}

	//do the same for height.
	if(virtualbottom > sy) {
		var diff = virtualbottom - sy;
		virtualbottom = sy;
		virtualtop -= diff;
	}
	
	
	//clamp to actual image bounds.
	var realtop = Math.max(0, virtualtop);
	var realleft = Math.max(0,virtualleft);
	
	
	var realbottom = Math.min(sy, virtualbottom);
	var realright = Math.min(sx, virtualright);
	
	
	var x = realleft;
	var y = realtop;
	var width = Math.floor(realright - realleft);
	var height = Math.floor(realbottom - realtop);
	
	//adjust to slice_size
	if((width % slice_size) != 0) {
		var width_overflow = (width % slice_size);
		width -= width_overflow;
	}
	if((height % slice_size) != 0) {
		var height_overflow = (height % slice_size);
		height -= height_overflow;
	}
	return canvas.getContext("2d").getImageData(x,y,width,height);
			
}

function evaluateNetworkForRect(net, rect, canvas, labels) {
	//create a canvas containing just pw field and nearby imagery.

	var sliceableData = getSlicableImage(rect, canvas);
	var slicingCanvas = document.createElement("canvas");
	slicingCanvas.width = sliceableData.width;
	slicingCanvas.height = sliceableData.height;
	slicingCanvas.getContext("2d").putImageData(sliceableData, 0, 0);
	
	

	var markedCanvas = document.createElement("canvas");
	markedCanvas.width = sliceableData.width; 
	markedCanvas.height = sliceableData.height;

	var markingctx = markedCanvas.getContext("2d");
	markingctx.putImageData(sliceableData, 0, 0);
	markingctx.strokeStyle ="#FF0000";


	
	var hits = {};
	for(let label of labels) {
		hits[label.id] = 0;
	}

	//slice the canvas in to SLICE_SIZE squares.
	var slices_total = 0;
	var slices_unique = 0;
	var negative_hits = 0;
	var positive_hits = 0;
	var hashes = {};
	var time = sliceCanvas(slicingCanvas, slice_size, function(x,y,image) {
		slices_total++;			

		//optimize evaluation of duplicate slices by storing results based on image hash.
		var imageHash = murmurHash3.x86.hash32(image.data);
		if(!(imageHash in hashes)){

			slices_unique++;

			var volume = image_data_to_volume(image, slice_size,slice_size);
			var activations = net.forward(volume);
			var result = evaluate_activation(activations, labels);
			hashes[imageHash] = result;

		}

		var result = hashes[imageHash];


		if(result.confidence > valid_threshold) {

			if(result.label.id == 'negative') {
				negative_hits++;
				markingctx.save();
				markingctx.strokeStyle ="#00FF00";
				markingctx.strokeRect(x+2,y+2,slice_size-3,slice_size-3);
				markingctx.fillText(result.label.id + " "+ result.confidence.toFixed(2),x+3,y+13);
				markingctx.restore();
			}
			else {
				hits[result.label.id]++;
				positive_hits++;
				markingctx.strokeRect(x+2,y+2,slice_size-3,slice_size-3);
				markingctx.fillText(result.label.id + " "+ result.confidence.toFixed(2),x+3,y+13);
			}
		}
		else {
			markingctx.save();
			markingctx.strokeStyle ="#0000FF";
			markingctx.strokeRect(x+2,y+2,slice_size-3,slice_size-3);
			markingctx.fillText(result.label.id + " "+ result.confidence.toFixed(2),x+3,y+13);
			markingctx.restore();
		}


	});

	return { 
		markedImage: markedCanvas.toDataURL(), 
		cleanImage: slicingCanvas.toDataURL(), 
		hits: hits,
		negative_hits: negative_hits,
		postive_hits: positive_hits,
		time: time, 
		slices: {total: slices_total, unique: slices_unique}
	};
}

function runPhinnAnalysis(geometry, tabData, windowId, callback) {

	getScreenshotImage(windowId, function(image) {

		//We should now have a screenshot at 1.0 scale. We want to restore the user's scale at this point while we run analysis.
		if(tabData != undefined && tabData.zoomLevel != undefined) {
			chrome.tabs.setZoom(tabData.tabId, tabData.zoomLevel);
		}


		getNetworkInstance(function(net, labels) {

			

			var canvas = document.createElement("canvas");
			renderImageAtScaleOnCanvas(image, canvas, capture_scale);

			var total_time = 0
			var results = [];

			//for each password field, evaluate the network.
			for(let rect of geometry) {
				var result = evaluateNetworkForRect(net, rect, canvas, labels);
				results.push(result);
				total_time += result.time;
			
				//log images to extension console
				if(tabData != undefined) {
					console.image(result.cleanImage);
					console.image(result.markedImage);
				}
				
				//take note of negative results so that we can treat them as if they were not there, reducing effective comparison area.  
				console.log("result:");
				console.log(result);
				var top = Object.keys(result.hits).reduce(function(a, b){ return result.hits[a] > result.hits[b] ? a : b });
				var top_hits = result.hits[top];
				var top_label = get_label_for_id(top,labels);
				
                var suspicious = top_hits >= min_hits && top_label.id != 'negative';
				
				console.log("suspicious:", suspicious);
				console.log("negative:", result.negative_hits);
				console.log("top_label:", top_label.id);
				console.log("top_hits:", top_hits);
				
				if(suspicious) {
					//Call back to the content-script that we have something worth checking out. 
					callback({
						suspicious: suspicious,
						totalTime: total_time, 
						top: {label: get_label_for_id(top, labels), hits: top_hits},
						hits: result.hits,
						result: result
					});
					return;					
				}
			}
			//Didn't find anything! 
			callback({suspicious: false, totalTime: total_time, results: results});
		});
	});
}
