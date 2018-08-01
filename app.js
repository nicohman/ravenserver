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
var getThemes = function(req, res){
	Theme.find({}, function(err, themes){
		ejs.renderFile("public/themes.ejs", {themes:themes}, function(err, str){
			res.send(str);
		});
	});
}
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
var User = mongoose.model('User', {
	name: String,
	id:String,
	pass:String,
	date:String
});
var loginTUser = function(req, res){
	User.findOne({name:req.query.name}, function(err, user){
		if(err){
			res.status(500).send();		
		} else {
			if (user){
				bcrypt.compare(req.query.pass, user.pass, function(err, resp){
					if(err){
						res.status(500).send();
					} else {
						if (resp){
						var token = jwt.sign({name:user.name, id:user.id}, config.secret);
						res.status(200).send({
							token:token,
							name:user.name
						});
						} else {
							console.log("Wrong login details");
							res.status(403).send();
						}
					}
				});
			} else {
				console.log("No user found");
				res.status(403).send();
			}
		}
	});
}
var createTUser = function(req, res){
	User.findOne({name:req.query.name}, function(err, user){
		if(!err){
			if(user){
				res.status(403).send();
			} else {
				console.log(req.query);
				bcrypt.hash(req.query.pass, 10, function(err, hashed){
					if(err){
						console.error(err);
						res.status(500).send();
					} else {
						var id = hash(req.query.name+ new Date());
						var nu =  new User({
							name:req.query.name,
							pass:hashed,
							id:id,
							date:new Date()
						});
						nu.save();
						res.status(200).send();
					}
					});
				}
			
		} else {
			console.error(err);
			res.status(500).send();
		}
	});
}

app.use(bodyParser.urlencoded({
	extended: true,
	uploadDir: "./public/tcdn/",
	limit:'50mb'
}));
var upTheme = function(req, res){
	if(!req.query.token){
		res.status(401).send();
	} else {
		jwt.verify(req.query.token, config.secret, function(err, un){
			if(!err){
				console.log("1");
				Theme.findOne({name:req.query.name}, function(err, theme){
					if(!err){
						if(theme && theme.author !== un.id){
							res.status(403).send();
						} else {
							var form = new formidable.IncomingForm();
							form.on('fileBegin', function (name, file) {
								console.log("writing file");
								ext = file.name.substr(file.name.length - 4);
								file.path = __dirname + "/public/tcdn/" + req.query.name+".tar";
							});
							form.on('end', function () {
								if(theme){
									theme.updated = new Date();
										res.status(200).send(req.query.name+".tar");

								} else {
									theme = new Theme({
										name:req.query.name,
										author:un.id,
										updated: new Date(),
										date:new Date(),
										description:req.query.desc,
										screenshot:req.query.screen,
										path:req.query.name+".tar"
									});

								res.status(201).send(req.query.name+".tar");
								}
								theme.save();
							
							});
							form.maxFileSize = 1024 * 1024 * 1024 * 16;
							console.log("parsing");
							form.parse(req, function (err) {
								console.log(err);
							});

						}
					} else {
						res.status(500).send();
					}
				});
			} else {
				res.status(500).send();
			}
		});
	}
}
app.post("/themes/delete/:name", function(req, res){
	if (req.query.token){
		jwt.verify(req.query.token, config.secret, function(err, un){
			if (err){
				res.status(401).send();
			} else {
				Theme.findOne({name:req.params.name}, function(err, theme){
				if (err) {
					res.status(500).send();
				} else {
					if (theme) {
						if (theme.author === un.id){
							Theme.deleteOne({name:req.params.name}, function(err, del){
								if (err){
									res.status(500).send();
								} else {
									fs.unlink(__dirname+"/public/tcdn/"+theme.path, function(err){
										if (err){
											console.error(err);
											res.status(500).send();
										} else {
											res.status(200).send();
										}
									});
								}
							});
						} else {
							res.status(403).send();
						}
					} else {
						console.log(theme);
						res.status(404).send();
					}
				}
			});
			}
		});
	} else {
		res.status(401).send();
	}
});
app.get("/themes/repo/:name", function(req, res){
	Theme.findOne({name:req.params.name}, function(err, theme){
		if (!err){
			if (theme){
				res.status(200).sendFile(__dirname+"/public/tcdn/"+theme.path);
			} else {
				res.status(404).send();
			}
		} else {
			res.status(500).send();
		}
	});	
});
app.get("/index.html", getThemes);
app.post("/themes/upload", upTheme);
app.post("/themes/user/create", createTUser);
app.get("/themes/user/login", loginTUser);
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


