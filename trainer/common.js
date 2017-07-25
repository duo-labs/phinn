
var PNG = require('pngjs').PNG;
var fs = require('fs');
var convnetjs = require('convnetjs');
var cnnutil = require('./cnnutil');

const DATA_ROOT = 'data/';

module.exports = {
	label_configs: [],
	label_accuracies: {},
	negative_labelid: 0,


	//initializes running average windows for every label.
	init_label_accuracies: function () {
		var alllabels = this.get_all_labels();

		for (var c = 0; c < alllabels.length; c++) {
			var cur = alllabels[c];
			this.label_accuracies[c] = { label: cur, window: new cnnutil.Window(100, 1) };
			if (cur === 'negative') {
				this.negative_labelid = c;
			}
		}
	},
	init_labels: function () {
		this.init_label_accuracies();
		this.label_configs = this.get_all_label_configs();
	},



	update_label_accuracy: function (labelid, val) {
		this.label_accuracies[labelid].window.add(val);
	},

	get_lowest_performer_label: function () {
		var min_val = 1.0;
		var min_label = null;
		for (let labelid in this.label_accuracies) {
			var label_acc = this.label_accuracies[labelid];
			var cur_avg = label_acc.window.get_average();
			if (cur_avg < min_val && labelid != this.negative_labelid) {
				min_val = cur_avg;
				min_label = labelid;
			}
		}
		return min_label;
	},

	get_current_accuracy: function (exclude_negatives) {
		var sum = 0.0;
		var total = 0;
		for (let labelid in this.label_accuracies) {
			var label_acc = this.label_accuracies[labelid];
			if (exclude_negatives && label_acc.label == this.negative_labelid) {
				continue;
			}

			sum += Math.max(0, label_acc.window.get_average());
			total++;
		}

		return sum / total;
	},

	//loads a PNG off of disk.
	get_image_data: function (imagePath) {
		var png = PNG.sync.read(fs.readFileSync(imagePath));
		return png;
	},

	//returns a WxHx4 volume for a given image(width,height,data)
	create_volume_for_image: function (image) {
		var W = image.width;
		var H = image.height;
		var p = image.data;

		var pv = [];
		for (var i = 0; i < p.length; i++) {


			pv.push((p[i] / 255.0) - 0.5); // normalize image pixels to [-0.5, 0.5]
		}
		var x = new convnetjs.Vol(W, H, 4, 0.0); //input volume (image)
		x.w = pv;
		return x;
	},

	//Converts a PNG specified by `imagePath` to a convnetjs volume. 
	create_volume_for_image_path: function (imagePath) {
		return this.create_volume_for_image(this.get_image_data(imagePath));
	},

	//Returns all labels. 
	get_all_labels: function () {
		var ret = [];
		for (let dir of fs.readdirSync(DATA_ROOT)) {
			ret.push(dir);
		}
		return ret;
	},

	//Returns all label configurations. 
	get_all_label_configs: function () {
		var ret = [];
		for (let label of this.get_all_labels()) {

			var json = JSON.parse(fs.readFileSync(DATA_ROOT + label + "/config.json"));
			ret.push(json);
			console.log(json);
		}
		return ret;
	},
	
	//Loads all samples out of working directories.
	load_all_samples: function () {
		var allsamples = [];
		var alllabels = this.get_all_labels();

		for (var c = 0; c < alllabels.length; c++) {
			var cur = alllabels[c];

			var files_for_label = fs.readdirSync(DATA_ROOT + cur + "/splits");

			for (var f = 0; f < files_for_label.length; f++) {

				var filepath = DATA_ROOT + cur + '/splits/' + files_for_label[f];
				allsamples.push({ 'label': c, 'label_str': cur, 'data': this.create_volume_for_image_path(filepath) });
			}

		}
		return allsamples;
	},

	//Gets the predicted label out of network activations. 
	evaluate_activation: function (activations, labels) {
		var preds = [];
		for (var k = 0; k < activations.w.length; k++) { preds.push({ k: k, p: activations.w[k] }); }
		preds.sort(function (a, b) { return a.p < b.p ? 1 : -1; });

		return {
			label: labels[preds[0].k],
			confidence: preds[0].p
		}
	},

	//Creates a convnetjs network from a json string.
	load_network_from_json: function (jsonstr) {
		var json = JSON.parse(jsonstr);
		var net = new convnetjs.Net();
		net.fromJSON(json.network);

		if ("negative_ratio" in json) {
			net.negative_ratio = json.negative_ratio;
		}
		return net;
	},

	//Loads a convnetjs network from a network file.
	load_network: function (file) {
		console.log("Loading network from file '" + file + "'");
		return this.load_network_from_json(fs.readFileSync(file));
	}
};