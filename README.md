![Logo]:(https://github.com/duo-labs/phinn/raw/master/site/phinn.gif "Logo")

# Project Phinn
A toolkit to generate an offline Chrome extension to detect phishing attacks using a bespoke convolutional neural network.

![Demo]:(https://github.com/duo-labs/phinn/raw/master/site/phinn.gif "Demo")

## Background
When it comes to phishing attacks what is the attacker actually attempting to accomplish? Primarily, they are trying to trick a user into voluntarily giving up their primary, and sometimes even secondary, credentials through a process of brand impersonation. With improvements to browser update hygiene attackers targeting modern corporate infrastructures have become less and less reliant on browser exploits to gain a foothold in to the corporate network. 

Corporate initiatives like user-training and [Google's Safe-Browsing](https://safebrowsing.google.com/) have helped stymie attackers but they have their shortcomings. Administrators can't entirely rely on the vigilance of users and blacklist approaches won't help with targeted attacks as they have likely never been seen before. 

## What

Phinn itself is a toolkit for enabling corporate administrators to generate and train a custom Chrome extension that can then be pushed out to the rest of their organization. 

The Chrome extension analyzes rendered page content for stylistic similarities between login forms through the use of a machine learning algorithm called a [Convolutional Neural Network](https://en.wikipedia.org/wiki/Convolutional_neural_network) as implemented by the [convnetjs](http://cs.stanford.edu/people/karpathy/convnetjs/) library. 

## How

Phinn can be configured with identity providers or other web properties that a given organization utilizes which would be likely to be phishing targets such as  Google Accounts or Office 365. Once the training is complete and the chrome extension is installed, when a user navigates to a given web page and a login form is identified a screenshot is captured of the rendered page and passed through this neural network. If Phinn thinks that the page utilizes stylistic properties that are visually extremely similar to the configured identity providers an alert for the user is generated. 



# Getting Started
Phinn ships with a network thats pre-trained on 8 providers, specifically Amazon Web Services, Dropbox Github, Google Accounts, Live, Office 365, Salesforce, and Twitter. These might not match your threat profile and should be modified. 

First and foremost, you must install the  unpacked Chrome extension by:
1) Visit `chrome://extensions` (via omnibox or menu -> Tools -> Extensions).

2) Enable Developer mode by ticking the checkbox in the upper-right corner.

3) Click on the "Load unpacked extension..." button.

4) Select the `chrome-ext` directory from this repository.

You should now see the Phinn icon in your extension tray.
  
## Collecting Samples
With a property / identity provider in mind. Create a directory in the `samples` subdirectory and create a `config.json` file in it. 

The config file is a very basic json document that provides a short identifier used internally, a user-friendly name and a list of valid domains. 

For instance `samples/google/config.json` looks like this: 
```
{ "id":"goog", "fullname":"Google", "domains": ["accounts.google.com"]}
```

Note that the domain list is full FQDN and subdomains must be manually accounted for. For instance to configure Dropbox for phinn you'd want to cover `dropbox.com` as well as `www.dropbox.com` like so:

```
{ "id":"box", "fullname":"Dropbox", "domains": ["dropbox.com", "www.dropbox.com"]}
```

Once you have this done its time to take a reference sample.  Navigate to a login page and click the Phinn chrome extension button. After a few seconds you will be presented with the network's analysis of the login form as can be seen in this Google example.

![Demo]:(https://github.com/duo-labs/phinn/raw/master/site/popup1.png "Demo")

Click the `Source` link to display an unmarked version of the image and right-click and save it to the folder you created in the samples directory. 

![Demo]:(https://github.com/duo-labs/phinn/raw/master/site/popup2.png "Demo")

Repeat this process for all other web-properties or identity providers you care about and remove the subdirectories that you do not care about only leaving the special purpose `negative` folder which contains negative samples and anything that triggers a false-positive. 

## Training the Network
To train the network be sure you have nodejs installed and execute `./train_network.sh`
This duration of this process is highly dependant on both the number of configured providers and their styling and can last anywhere from a couple hours to more than twelve.

The training process will self-terminate once it reaches an accuracy of 95% and output a `network.json` file every 1000 ticks. 

## Testing the Network 
Execute `./copy_net_to_extension.sh` to copy the `network.json` file from the `trainer` directory to the `chrome-ext` folder. 

Visit the `chrome://extensions` page again and click the `Reload` link on Phinn's extension. 

Visit the identity provider's login page and click on Phinn's icon. If everything went well, you will be presented with the marked up image showing network activations and an affirmative `This looks like a GOOGLE page to me!` 

If you have a known phishing sample, load it and see if the alert is generated a few seconds after page load.

## Deployment
To create a package for your extension execute `./make_release.sh` which will take the unpacked extension and generate a zip file that can be uploaded to the chrome-web-store.

NOTE: You'll probably have to edit the extension manifest ( `chrome-ext/manifest.json`) to specify the extension key as generated by Google and increment the version number. 

## Handling False Positives
When dealing with neural networks false positives are bound to crop up. Luckily they are fairly straight forward to handle but does require the re-training of the network.

When a report of a false positive comes in perform the collection procedure as mentioned in the collecting samples section and place the un-marked up image in the `samples/negative` folder and retrain the network by executing `./train_network.sh` again. 


# Implementation Details

## Neural Network Design
The CNN's input layer takes a 96x96 pixel square with 3 color channels.

This is then fed through three pairs of convolution and pooling layers with relu activations before reaching final softmax output layer corresponding the labels.  

In convnetjs terms, the network is defined as follows:
```
var layer_defs = [];
layer_defs.push({type:'input', out_sx:SLICE_SIZE, out_sy:SLICE_SIZE, out_depth:3});
layer_defs.push({type:'conv', sx:5, filters:18, stride:1, pad: 2, activation:'relu'});
layer_defs.push({type:'pool', sx:4, stride:2});
layer_defs.push({type:'conv', sx:5, filters:20, stride:1, pad: 2, activation:'relu'});
layer_defs.push({type:'pool', sx:4, stride:2});
layer_defs.push({type:'conv', sx:5, filters:20, stride:1, pad: 2, activation:'relu'});
layer_defs.push({type:'pool', sx:4, stride:2});

layer_defs.push({type:'softmax', num_classes:labels.length});
```

## Training Process
The training process works by taking the super-samples (full images in `samples/x/`) and performing a random crop to get a 96x96x3 volume that the network can ingest and trained using the [adadelta](https://arxiv.org/abs/1212.5701) algorithm. Once the network becomes fairly competent at identifying the configured labels, the trainer starts to increase the ratio of negative suer-samples to give the network more resilience in handling the open-set that is the internet. Negative samples also go through additional augmentation to stretch their usefulness. 

Additionally, [roulette-selection](https://en.wikipedia.org/wiki/Fitness_proportionate_selection) is performed when feeding positive case samples preferring the bad performers.

## Extension Functionality
The chrome extension itself can be split in to three logical parts.
### Form Identification 
Login forms are identified by iterating through all input elements after the DOM has settled from initial page load. Visibility checks are performed to make sure the elements are actually visible before moving on to the capture phase. 

### Capture
Capture is performed through the screenshot API and the resulting image is scaled to 50% of its original size to increase network evaluation performance. The captured image is then cropped to the a bounding area around the login form and passed on for use in network evaluation.  

### Activation
The cropped, 50% scale image (ie what you get when you perform sample capture) is then manually convoluted over in 96x96 squares and passed through the network. If there are more than three strong (confidence over 50%) activations then the global label is deemed to apply and passed down to the content script for alert generation. 

## Limitations 
* Currently framed forms are not supported.
* Occasionally the V8 optimizer decides its not happy and network evaluations can take a very long time. 
* Lack of GPU acceleration on activation limits the number of checks phinn can do in a reasonable amount of time. Ideally a a stride less than the network input size should be utilized. [keras-js](https://github.com/transcranial/keras-js) looks promising on this front. 
* Mitigating false positive cases requires full retraining of the network which is also greatly hindered by lack of GPU acceleration and limits iteration. 