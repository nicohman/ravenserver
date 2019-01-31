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
var md5 = require("nodejs-md5");
var jwt = require("jsonwebtoken");
var bodyParser = require('body-parser');
var privKey = fs.readFileSync("/etc/letsencrypt/live/demenses.net/privkey.pem",
    "utf8");
var cert = fs.readFileSync("/etc/letsencrypt/live/demenses.net/fullchain.pem",
    "utf8");
var config = require("./config.json");
if (config.include_downloads) {
    var downloads = require("./downloads.json");
}
var san = require("sanitizer");
var request = require("request");
var nodemailer = require("nodemailer");
var mConf = {
    host: config.emailhost,
    port: 465,
    secure: true,
    pool: true,
    auth: {
        user: config.emailuser,
        pass: config.emailpass
    }
}
var trans = nodemailer.createTransport(mConf);
trans.verify(function(err) {
    if (err) {
        console.error(err);
    }
});
mongoose.connect("mongodb://localhost/themes");
var Theme = mongoose.model('Theme', {
    name: String,
    date: String,
    author: String,
    pauthor: String,
    path: String,
    screen: String,
    updated: String,
    description: String,
    installs: Number,
    votes: Number,
    reports: Array,
    approved: Boolean
});
var User = mongoose.model('User', {
    name: String,
    id: String,
    pass: String,
    date: String
});
app.use(bodyParser.urlencoded({
    extended: true,
    uploadDir: "./public/tcdn/",
    limit: '50mb'
}));
var loginTUser = function(req, res) {
    User.findOne({
        name: req.query.name
    }, function(err, user) {
        if (err) {
            res.status(500).send();
        } else {
            if (user) {
                bcrypt.compare(req.query.pass, user.pass, function(err, resp) {
                    if (err) {
                        res.status(500).send();
                    } else {
                        if (resp) {
                            var token = jwt.sign({
                                name: user.name,
                                id: user.id
                            }, config.secret);
                            res.status(200).send({
                                token: token,
                                name: user.name
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
var createTUser = function(req, res) {
    if (req.query.name && req.query.pass) {
        if (req.query.name.length < 20 && req.query.pass.length < 100) {
            req.query.name = san.escape(req.query.name);
            User.findOne({
                name: req.query.name
            }, function(err, user) {
                if (!err) {
                    if (user) {
                        res.status(403).send();
                    } else {
                        console.log(req.query);
                        bcrypt.hash(req.query.pass, 10, function(err, hashed) {
                            if (err) {
                                console.error(err);
                                res.status(500).send();
                            } else {
                                var id = hash(req.query.name + new Date());
                                var nu = new User({
                                    name: req.query.name,
                                    pass: hashed,
                                    id: id,
                                    date: new Date()
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
        } else {
            res.status(413).send();
        }
    } else {
        res.status(401).send();
    }
}
var getThemes = function(req, res) {
    Theme.find({}, null, {
        sort: {
            installs: -1
        }
    }, function(err, themes) {
        console.log("rendering");
        console.log(themes);
        ejs.renderFile("public/themes.ejs", {
            themes: themes,
            ptitle: "All themes",
            constraints: "Sorted by total installs",
            include_downloads: config.include_downloads
        }, function(err, str) {
            if (err) {
                console.error(err);
            }
            res.send(str);
        });
    });
}
app.get("/themes/report/:name", function(req, res) {
    ejs.renderFile("public/report.ejs", {
        name: req.params.name,
        ptitle: "Report a Theme",
        include_downloads: config.include_downloads
    }, function(err, str) {
        if (err) {
            console.error(err);
        }
        res.send(str);
    });
});
app.get("/themes/report", function(req, res) {
    ejs.renderFile("public/report.ejs", {
        name: "",
        ptitle: "Report a Theme",
        include_downloads: config.include_downloads
    }, function(err, str) {
        if (err) {
            console.error(err);
        }
        res.send(str);
    });
});
app.post("/themes/report", function(req, res) {
    if (req.body && req.body.name && req.body.reason) {
        trans.sendMail({
            from: "themes@demenses.net",
            to: "nico.hickman@gmail.com",
            subject: "Report",
            text: "Name:" + req.body.name + "\nReason:" + req.body.reason + "\nAdditional Information:" + req.body.info
        }, function(err) {
            Theme.findOne({
                name: req.body.name
            }, function(err, t) {
                t.reports.push({
                    date: new Date(),
                    reason: req.body.reason,
                    info: req.body.info
                });
                t.save();
            });
            if (err) {
                console.error(err);
                ejs.renderFile("public/reported.ejs", {
                    done: false
                }, function(err, str) {

                    if (err) {
                        console.error(err);
                    }
                    res.send(str);

                });
            } else {
                ejs.renderFile("public/reported.ejs", {
                    done: true
                }, function(err, str) {
                    if (err) {
                        console.error(err);
                    }
                    res.send(str);


                });
            }
        });
    } else {
        res.status(401).send();
    }
    console.log(req.body);
});
app.get("/recent", function(req, res) {
    Theme.find({}, null, {
        sort: {
            updated: -1
        }
    }, function(err, themes) {
        ejs.renderFile("public/themes.ejs", {
            themes: themes,
            ptitle: "All themes",
            constraints: "Sorted by most recent",
            include_downloads: config.include_downloads
        }, function(err, str) {
            if (err) {
                console.error(err);
            }
            res.send(str);
        });
    });
});
app.get("/about", function(req, res) {
    ejs.renderFile("public/about.ejs", {
        include_downloads: config.include_downloads
    }, function(err, str) {
        if (err) {
            console.error(err);
        }
        res.send(str);
    });
});
app.get("/downloads", function(req, res) {
    res.redirect("https://nicohman.demenses.net/downloads");
});
if (config.include_downloads) {
    app.get("/checksums", function(req, res) {
        var sums = {};
        md5.file("public/static/raven-nightly", function(err, rsum) {
            if (err) {
                console.err(err);
            } else {
                md5.file("public/static/ravend-nightly", function(err, rdsum) {
                    if (err) {
                        console.err(er);
                    } else {
                        md5.file("public/static/eidolon-nightly", function(err, esum) {
                            if (err) {
                                console.err(err);
                            } else {
                                md5.file("public/static/graven-nightly", function(err, gsum) {
                                    if (err) {
                                        console.err(err);
                                    } else {
                                        md5.file("public/static/wyvern-nightly", function(err, wsum) {
                                            if (err) {
                                                console.err(err);
                                            } else {
                                                sums.raven = rsum;
                                                sums.ravend = rdsum;
                                                sums.eidolon = esum;
                                                sums.graven = gsum;
                                                sums.wyvern = wsum;
                                                ejs.renderFile("public/checksums.ejs", {
                                                    sums: sums
                                                }, function(err, str) {
                                                    if (err) {
                                                        console.err(err);
                                                    }
                                                    res.send(str);
                                                });
                                            }
                                        });
                                    }
                                });
                            }
                        });
                    }
                });
            }
        });

    });
}
app.get("/themes/users/view/:id", function(req, res) {
    Theme.find({
        author: req.params.id
    }, function(err, themes) {
        if (err) {
            console.error(err);
        } else {
            if (themes) {
                ejs.renderFile("public/themes.ejs", {
                    themes: themes,
                    ptitle: "All themes by " + themes[0].pauthor,
                    constraints: "",
                    include_downloads: config.include_downloads
                }, function(err, str) {
                    if (err) {
                        console.error(err);
                    }
                    res.send(str);
                });
            } else {
                res.redirect("/404");
            }
        }
    });
});
app.get("/themes/view/:name", function(req, res) {
    console.log(req.params.name);
    Theme.findOne({
        name: req.params.name
    }, function(err, theme) {
        if (err) {
            console.error(err);
            res.redirect("/404");
        } else {
            if (theme) {
                console.log(theme);
                ejs.renderFile("public/theme.ejs", {
                    theme: theme,
                    include_downloads: config.include_downloads
                }, function(err, str) {
                    if (err) {
                        console.error(err);
                    }
                    res.send(str);
                });
            } else {
                res.redirect("/404");
            }

        }
    });
});


var upTheme = function(req, res) {
    if (!req.query.token) {
        res.status(401).send();
    } else {
        jwt.verify(req.query.token, config.secret, function(err, un) {
            if (!err) {
                if (req.query.name && req.query.name.length > 200) {
                    res.status(413).send();
                } else if (req.query.name) {
                    req.query.name = san.escape(req.query.name);
                    Theme.findOne({
                        name: req.query.name
                    }, function(err, theme) {
                        if (!err) {
                            if (theme && theme.author !== un.id) {
                                res.status(403).send();
                            } else {
                                var form = new formidable.IncomingForm();
                                form.on('fileBegin', function(name, file) {
                                    console.log("writing file");
                                    ext = file.name.substr(file.name.length - 4);
                                    file.path = __dirname + "/public/tcdn/" + req.query.name + ".tar";
                                });
                                form.on('end', function() {
                                    if (theme) {
                                        theme.updated = new Date();
                                        res.status(200).send(req.query.name + ".tar");

                                    } else {
                                        theme = new Theme({
                                            name: req.query.name,
                                            author: un.id,
                                            pauthor: un.name,
                                            updated: new Date(),
                                            date: new Date(),
                                            description: undefined,
                                            screenshot: undefined,
                                            path: req.query.name + ".tar"
                                        });

                                        res.status(201).send(req.query.name + ".tar");
                                    }
                                    theme.save();

                                });
                                form.maxFileSize = 1024 * 1024 * 1024 * 16;
                                console.log("parsing");
                                form.parse(req, function(err) {
                                    console.log(err);
                                });

                            }
                        } else {
                            res.status(500).send();
                        }
                    });
                } else {
                    res.status(401).send();
                }
            } else {
                res.status(500).send();
            }
        });
    }
}
app.post("/themes/meta/:name", function(req, res) {
    if (req.query.token && req.query.typem && req.query.value) {
        if (req.query.value.length < 200) {
            req.query.value = san.escape(req.query.value);
            jwt.verify(req.query.token, config.secret, function(err, t) {
                if (err) {
                    res.status(500).send()
                } else {
                    Theme.findOne({
                        name: req.params.name
                    }, function(err, th) {
                        if (err) {
                            res.status(500).send();
                        } else {
                            if (th) {
                                if (th.author == t.id) {
                                    if (req.query.typem == "screen" || req.query.typem == "description") {
                                        th[req.query.typem] = req.query.value;
                                        th.save();
                                        res.status(200).send();
                                    } else {
                                        res.status(412).send();
                                    }
                                } else {
                                    res.status(403).send();
                                }
                            } else {
                                res.status(404).send();
                            }
                        }
                    });
                }
            });
        } else {
            res.status(413).send();
        }
    } else {
        res.status(401).send();
    }
});
app.get("/themes/meta/:name", function(req, res) {
    Theme.findOne({
        name: req.params.name
    }, function(err, th) {
        if (err) {
            res.status(500).send();
        } else {
            if (th) {
                let r = JSON.stringify({
                    screen: th.screen,
                    description: th.description
                });
                res.status(200).send(r);
            } else {
                res.status(404).send();
            }
        }
    });
});
app.post("/themes/users/delete/:user", function(req, res) {
    if (req.query.token && req.query.pass) {
        jwt.verify(req.query.token, config.secret, function(err, t) {
            if (err) {
                res.status(401).send();
            } else {
                if (req.params.user == t.name) {
                    User.findOne({
                        id: t.id,
                        name: t.name
                    }, function(err, u) {
                        if (err) {
                            res.status(500).send();
                        } else {
                            if (u) {
                                bcrypt.compare(req.query.pass, u.pass, function(err, c) {
                                    if (err) {
                                        res.status(500).send();
                                    } else {
                                        if (c) {
                                            if (u.name == req.params.user && u.name == t.name) {
                                                User.deleteOne({
                                                    id: t.id,
                                                    name: t.name
                                                }, function(err) {
                                                    Theme.deleteMany({
                                                        author: t.id
                                                    }, function(err, o) {
                                                        if (err) {
                                                            res.status(500).send();
                                                        } else {
                                                            res.status(200).send();
                                                        }
                                                    });
                                                });
                                            } else {
                                                res.status(403).send();
                                            }
                                        } else {
                                            res.status(403).send();
                                        }
                                    }
                                });
                            } else {
                                console.log(u);
                                res.status(404).send();
                            }
                        }
                    });
                } else {
                    res.status(403).send();
                }
            }
        });
    } else {
        res.status(401).send();
    }
});
if (config.include_downloads) {
    function downloadsCounter(req, res, next) {
        if (req.path.includes("nightly")) {
            if (downloads[req.path]) {
                downloads[req.path]++;
            } else {
                downloads[req.path] = 1;
            }
            fs.writeFile("downloads.json", JSON.stringify(downloads), function() {});
        }
        next();
    }
    app.use(downloadsCounter);
}
app.use(express.static("/home/nicohman/ravenserver/public/static"));
app.post("/themes/delete/:name", function(req, res) {
    if (req.query.token) {
        jwt.verify(req.query.token, config.secret, function(err, un) {
            if (err) {
                res.status(401).send();
            } else {
                Theme.findOne({
                    name: req.params.name
                }, function(err, theme) {
                    if (err) {
                        res.status(500).send();
                    } else {
                        if (theme) {
                            if (theme.author === un.id) {
                                Theme.deleteOne({
                                    name: req.params.name
                                }, function(err, del) {
                                    if (err) {
                                        res.status(500).send();
                                    } else {
                                        fs.unlink(__dirname + "/public/tcdn/" + theme.path, function(err) {
                                            if (err) {
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
app.get("/themes/repo/:name", function(req, res) {
    Theme.findOne({
        name: req.params.name
    }, function(err, theme) {
        if (!err) {
            if (theme) {
                if (theme.reports.length > 0 && !theme.approved) {
                    res.status(208);
                } else {
                    res.status(200);
                }
                res.sendFile(__dirname + "/public/tcdn/" + theme.path);
                theme.installs++;
                theme.save();
            } else {
                res.status(404).send();
            }
        } else {
            res.status(500).send();
        }
    });
});
app.get("/index.html", getThemes);
app.get("/", getThemes);
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
serv.listen(8080);
htt.all("*", function(req, res) {
    return res.redirect("https://" + req.headers['host'] + req.url);
});
//htt.listen(80);
