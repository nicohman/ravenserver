var express = require('express');
var app = express();
var htt = express();
var fs = require("fs");
var https = require("https");
var ejs = require("ejs");
var mongoose = require("mongoose");
var formidable = require("formidable");
var path = require("path");
var bcrypt = require("bcrypt");
var shahash = require('crypto');
var shahash = require('crypto');
var jwt = require("jsonwebtoken");
var bodyParser = require('body-parser');
var privKey = fs.readFileSync("/etc/letsencrypt/live/demenses.net/privkey.pem",
	"utf8");
var cert = fs.readFileSync("/etc/letsencrypt/live/demenses.net/fullchain.pem",
	"utf8");
var config = require("./config.json");
var request = require("request");
mongoose.connect("mongodb://localhost/themes");
var Theme = mongoose.model('Theme', {
	name:String,
	date:String,
	author:String,
	path:String,
	screen:String,
	updated:String,
	description: String
});
var TUser = mongoose.model('User', {
	name: String,
	id:String,
	pass:String,
	date:String
});
app.use(bodyParser.urlencoded({
	extended: true,
	uploadDir: "./public/tcdn/"
}));
app.get("/index.html", getThemes);
app.post("/themes/upload", upTheme);
console.log("Listening on 80");
function hash(data) {
	return shahash.createHash('sha1').update(data, 'utf-8').digest('hex');
}
var serv = https.createServer({
	key: privKey,
	cert: cert
}, app);
serv.listen(443);
htt.all("*", function (req, res) {
	return res.redirect("https://" + req.headers['host'] + req.url);
});
htt.listen(80);
var getThemes = function(req, res){
	Theme.find({}, function(err, themes){
		ejs.renderFile("public/themes.ejs", {themes:themes}, function(err, str){
			res.send(str);
		});
	});
}
var loginTUser = function(req, res){
	User.findOne({name:req.params.name}, function(err, user){
		if(err){
			res.status(500).send();		
		} else {
			if (user){
				bcrypt.compare(user.pass, req.params.pass, funnction(err, res){
					if(err){
						res.status(500).send();
					} else {
						var token = jwt.sign({name:user.name, id:user.id});
						res.send(token);
					}
				});
			} else {
				res.status(403).send();
			}
		}
	});
}
var createTUser = function(req, res){
	User.findOne({name:req.body.name}, function(err, user){
		if(!err){
			if(user){
				res.status(403).send();
			} else {
				bcrypt.hash(req.body.pass, 10, function(err, hashed){
					if(err){
						res.status(500).send();
					} else {
						var id = hash(name+Date.new());
						var nu =  new User({
							name:req.body.name,
							pass:hashed,
							id:id,
							date:Date.new()
						});
						nu.save();
					});
				}
			}
		} else {
			res.status(500).send();
		}
	});
}
var upTheme = function(req, res){
	if(!req.params.token){
		res.status(401).send();
	} else {
		jwt.verify(req.params.token, config.secret, function(err, un){
			if(!err){
				Theme.findOne({name:req.params.name}, function(err, theme){
					if(!err){
						if(theme && theme.author !== un.id){
							res.status(403).send();
						} else {
							var form = new formidable.IncomingForm();
							form.on('fileBegin', function (name, file) {
								ext = file.name.substr(file.name.length - 4);
								file.path = __dirname + "/public/tcdn/" + req.params.name+".tar";
							});
							form.on('end', function () {
								if(theme){
									theme.updated = Date.new();
								} else {
									theme = new Theme({
										name:req.params.name,
										author:un.id,
										updated:Date.new(),
										date:Date.new(),
										description:req.params.desc,
										screenshot:req.params.screen,
										path:req.params.name+".tar"
									});
								}
								theme.save();
								res.status(201).send(req.params.name+".tar");
							});
							form.parse(req, function () {});

						}
					} else {
					}
				});
			} else {
				res.status(500).send();
			}
		});
	}
}

