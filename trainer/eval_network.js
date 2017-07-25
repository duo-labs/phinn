//Utility to evaluate networks. 
//ie node eval_network.js --net network.json --slicesize 96 --step 96 --img ../samples/google/login.png

var common = require("./common");
var convnetjs= require('convnetjs');

function usage() {
	console.log(process.argv[0] +" " + process.argv[1] + " --net NETWORK.JSON --slicesize SLICE_SIZE --step 1 --img FILENAME [--x Xoffset --y Yoffset]");
};

//takes an image volume and steps through it performing a manual convolution.
function sliceImgVol(imgVol,slicesize, xystep,cb) {
	for(var x=0;x<=imgVol.sx-slicesize;x+=xystep) {
		for(var y=0;y<=imgVol.sy-slicesize;y+=xystep) {
			cb(x,y,convnetjs.augment(imgVol,slicesize, x,y));
		}
	}
};

function process_volume(x,y, cropImgVol){
	
	var activations = net.forward(cropImgVol);
	var topIdx = net.getPrediction();
	var topLabel = labels[topIdx];
	var topConfidence = activations.w[topIdx];
	
	var top = common.evaluate_activation(activations, labels);
	
	console.log("("+x + "," + y + "): "+topIdx + " " + topLabel+ " = "+top.confidence.toFixed(3));	
}

var argv = require('minimist')(process.argv.slice(2));

if(!("net" in argv)) {
	console.log("no network defined.");
	usage();
	process.exit(1);
}

if(!("slicesize" in argv)) {
	console.log("no slicesize defined.");
	usage();
	process.exit(1);
}
if(!("step" in argv)) {
	console.log("no step defined.");
	usage();
	process.exit(1);
}
if(!("img" in argv)) {
	console.log("no img defined.");
	usage();
	process.exit(1);
}

var xoffset = -1;
var yoffset = -1;
if("x" in argv && "y" in argv) {
	xoffset = argv.x;
	yoffset = argv.y;
}


var net = common.load_network(argv.net);

if(net === 'undefined') {
	console.log("error loading network.");
	process.exit(1);
}

var labels = common.get_all_labels();
var imgVol = common.create_volume_for_image_path(argv.img);

if(xoffset == -1 && yoffset == -1) {
	sliceImgVol(imgVol, argv.slicesize, argv.step, process_volume);
}
else {
	var cropVol = convnetjs.augment(imgVol, argv.slicesize, xoffset, yoffset);
	process_volume(xoffset, yoffset, cropVol);
}













