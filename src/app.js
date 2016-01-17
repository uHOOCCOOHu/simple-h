//var $, Showdown, MathJax, Prism, Spine, Hogan, Github, err;

var global = {};
var gconfig = null;
var repo = null;
var editor = null;
var user_template = null;
var site_branch, site_repo;
var pattern_more = /^-+more-+$/m;
function wrap_source(md) {
    return "(("+md.replace(/>/g, "\\>")+"))"
}
function mdtohtml(md) {
    var converter = new Showdown.converter();
    return converter.makeHtml(md);
}
function extract_source(htmlsource)
{
    return htmlsource.match(/<!--\(\(([\s\S]*?)\)\)-->/m)[1].replace(/\\>/g, ">");
}
function mdupdate() {
    var tmp = $("#editmd").val();
    sessionStorage.setItem("editmd", tmp);
    tmp = mdtohtml(tmp);
    $("#edithtml").html(tmp);
    Prism.highlightAll();
    MathJax.Hub.Queue(["Typeset", MathJax.Hub, "edithtml"]);
}
function curry(fn) {
    var args = Array.prototype.slice.call(arguments, 1);
    return function() {
        var innerArgs = Array.prototype.slice.call(arguments);
        var finalArgs = args.concat(innerArgs);
        return fn.apply(null, finalArgs);
    };
}
function asyncFinish(total, success) {
    var cnt = 0;
    $("#loading").show();
    return function() {
        cnt++;
        if (cnt == total) {
            $("#loading").hide();
            if (typeof success == "function")
                success();
        }
    }
}
function asyncSeq(success) {
    var args = Array.prototype.slice.call(arguments, 1);
    var finish = asyncFinish(args.length, success);
    for (var i = 0; i < args.length; ++i) {
        args[i](finish);
    }
}
function syncSeq(success) {
    var args = Array.prototype.slice.call(arguments, 1);
    var finish = asyncFinish(1, success);
    var l = args.length;
    var tmp = curry(args[l-1], finish);
    for (var i = l-2; i >= 0; --i)
        tmp = curry(args[i], tmp);
    tmp();
}
function errShow(item, err) {
    if (typeof err != "undefined" && err != null) {
        console.log(err);
        $("#loading").hide();
        item.show();
        return true;
    }
    return false;
}
function asyncWrite(data, target, err, finish) {
    if (!repo)
        Spine.Route.navigate("");
    repo.write(site_branch, target, data, "simple",
               function(e) {
                   var ret = err(e);
                   if (ret == false)
                       finish();
                });
}
function asyncWriteFile(source, target, err, finish) {
    if (!repo)
        Spine.Route.navigate("");
    $.ajax({
        url: source, 
        type: "GET",
        dataType: "text",
        success: function(data) {asyncWrite(data, target, err, finish)},
        error: function(e) {err(e);}
    });
}
function checkpass(user, pass, cbsuccess, cberror) {
    var github = new Github({
        username: user,
        password: pass,
        auth: "basic"
    });
    var u = github.getUser();
    u.show(user, function(err, ret){
        $("#loading").hide()
        if (!cberror(err)) {
            global.github = github;
            global.user = user;
            repo = github.getRepo(user, site_repo);
            repo.show(function(err) {
                if (!cberror(err))
                    cbsuccess();
            })
        }
    });
}
$(document).ready(function() {
    var Logins = Spine.Controller.sub({
        el: $("#login"),
        elements: {
            "form": "form",
            "#loginuser": "user",
            "#loginpass": "pass",
            "#loginrepo": "repo",
            "#loginbranch": "branch",
            "#loginerror": "err",
        },
        events: {
            "submit form": "check",
        },
        check: function(e) {
            $("#loading").show();
            e.preventDefault();
            site_repo = this.repo.val();
            site_branch = this.branch.val();
            checkpass(this.user.val(), this.pass.val(),
                      function(){Spine.Route.navigate("/main");},
                      curry(errShow, this.err));
        },
        init: function() {
            this.user.val("");
            this.pass.val("");
            $("#loading").hide();
            this.err.hide();
        }
    });
    var Mains = Spine.Controller.sub({
        el: $("#main"),
        elements: {
            "#initerror": "err",
            "#initok": "ok",
        },
        events: {
            "click #init": "initRepo",
            "click #go": "go",
        },
        initRepo: function(e) {
            e.preventDefault();
            var error = curry(errShow, this.err);
            syncSeq(
                function() {$("#initok").show()},
                curry(asyncWriteFile, "template/index.template", "index.template", error),
                curry(asyncWriteFile, "template/article.template", "article.template", error),
                curry(asyncWriteFile, "template/archives.template", "archives.template", error),
                curry(asyncWriteFile, "template/main.css", "main.css", error),
                curry(asyncWriteFile, "template/main.json", "main.json", error),
                curry(asyncWrite, "", "CNAME", error)
            );
        },
        go: function(e) {
            this.navigate("/posts");
        },
        init: function() {
            $("#loading").hide();
            this.err.hide();
        }
    });
    var Posts = Spine.Controller.sub({
        el: $("#posts"),
        init: function(param) {
            $("#loading").hide();
            if (editor != null)
                editor.destroy();
            var type = null;
            var num = null;
            var now = null;
            if (typeof param != "undefined" && param.hasOwnProperty("type"))
                type = param.type;
            if (typeof param != "undefined" && param.hasOwnProperty("num"))
                num = param.num;
            if (repo != null) {
                $("#loading").show();
                $("#posttitle").val("");
                $("#postpath").val("");
                $("#postdate").val("");
                $("#posttags").val("");
                $("#edithtml").html("");
                repo.read(site_branch, "main.json", function(err, data) {
                    $("#loading").hide();
                    $("#editmd").val(sessionStorage.getItem("editmd") || "before begin to write please click 'new post' first");
                    var config = JSON.parse(data);
                    gconfig = config;
                    var posts = config.articles;
                    var render_obj = [];
                    for (var i = 0; i < posts.length; ++i) {
                        var cur_obj = {"title": posts[i].title, "num": i};
                        if (num != "null" && Math.floor(num) == i) {
                            now = posts[i];
                            cur_obj.active = true;
                            $("#postSave").attr("href", "#/posts/savepost");
                            $("#postDelete").attr("href", "#/posts/deletepost/"+i);
                        }
                        render_obj.push(cur_obj);
                    }
                    var itemTemplate = Hogan.compile($("#postsItem").html());
                    var postsItemHtml = itemTemplate.render({"items": render_obj});
                    $("#postItems").html(postsItemHtml);
                    if (type != null && type.slice(0, 3) == "new") {
                        if (type.slice(3) == "post") {
                            $("#postSave").attr("href", "#/posts/savepost");
                            $("#postDelete").attr("href", "#/posts");
                            $("#postdate").val((new Date()).toISOString());
                        }
                    }
                    if (now != null) {
                        $("#posttitle").val(now.title);
                        $("#postpath").val(now.filename);
                        $("#postdate").val(now.time);
                        $("#posttags").val(now.tags.join(" "));
                        $("#loading").show();
                        $("#editmd").val();
                        $("#edithtml").html();
                        repo.read(site_branch, "articles/"+now.filename, function(err, data) {
                            $("#loading").hide();
                            $("#editmd").val(extract_source(data));
                            mdupdate();
                        });
                    }
                    
                    $("#btnGenIndex").on("click", function() {
                        $("#loading").show();
                        repo.read(site_branch, "index.template", function(err, data) {
                            var html_final = Hogan.compile(data).render(gconfig);
                            repo.write(site_branch, "index.html", html_final, "render", function(err) {
                                $("#loading").hide();
                            });
                        });
                    });
                });
            }
        }
    });
    var SimpleApp = Spine.Controller.sub({
        el: $("body"),
        init: function() {
            this.logins = new Logins();
            this.mains = new Mains();
            this.posts = new Posts();
            $("#postDelete").click(function(){return confirm("Are you sure you want to delete?");});
            this.routes({
                "": function() {this.logins.init();this.logins.active();},
                "/main": function() {this.mains.init();this.mains.active();},
                "/posts/:type/:num": function(param) {
                    var type = param.type;
                    var num = Math.floor(param.num);
                    var temp = this;
                    if (type.slice(0, 6) == "delete") {
                        $("#loading").show();
                        var now = gconfig.articles[num];
                        if (type == "deletepost") {
                            var posts = [];
                            for (var i = 0; i < gconfig.articles.length; ++i) {
                                if (i != num)
                                    posts.push(gconfig.articles[i]);
                            }
                            gconfig.articles = posts;
                        }
                        repo.write(site_branch, "main.json", JSON.stringify(gconfig), "remove", function(err) {
                            repo.delete(site_branch, "articles/"+now.filename, function(err) {
                                temp.posts.init(param);
                                temp.posts.active();
                            });
                        });
                    }
                    else {
                        temp.posts.init(param);
                        temp.posts.active();
                    }
                },
                "/posts/:type": function(param) {
                    var type = param.type;
                    var temp = this;
                    if (type.slice(0, 4) == "save") {
                        $("#loading").show();
                        var posts = gconfig.articles;
                        var md = $("#editmd").val();
                        var now = {"filename": $("#postpath").val(),
                                   "time": $("#postdate").val(),
                                   "title": $("#posttitle").val(),
                                   "tags": $("#posttags").val().split(/[,\s]+/),
                                   "source": "",
                                   "content": "",
                                   "brief": ""};
                        var idx_more = md.search(pattern_more);
                        if(idx_more != -1) {
                            now.brief = mdtohtml(md.slice(0, idx_more));
                            md = md.replace(pattern_more, "\n\n");
                        }
                        now.source = wrap_source(md);
                        now.content = mdtohtml(md);
                        repo.read(site_branch, "article.template", function(err, data) {
                            if(!data) {
                                err(e);
                            }
                            else {
                                $("#saveerror").hide();
                                gconfig.current = now;
                                var html_final = Hogan.compile(data).render(gconfig);
                                repo.write(site_branch, "articles/"+now.filename, html_final, "save", function(err) {
                                    now.content = now.source = undefined;
                                    gconfig.current = undefined;
                                    var mark = null;
                                    for (var i = 0; i < posts.length; ++i)
                                        if (posts[i].filename == now.filename)
                                            mark = i;
                                    if (mark != null)
                                        posts[mark] = now;
                                    else
                                        posts.push(now);
                                    repo.write(site_branch, "main.json", JSON.stringify(gconfig), "save", function(err) {
                                        if (!errShow($("saveerror", err))) {
                                            temp.posts.init(param);
                                            temp.posts.active();
                                        }
                                    });    
                                });
                            }
                        });
                    }
                    else {
                        temp.posts.init(param);
                        temp.posts.active();
                    }
                },
                "/posts": function() {this.posts.init();this.posts.active();}
            });
            this.manager = new Spine.Manager(this.logins, this.mains, this.posts);
            Spine.Route.setup();
        }
    });
    new SimpleApp();
    $("#editmd").on("keyup", function() {
        mdupdate();
    });
    $("#loginuser").on("keyup", function() {
        var user = $("#loginuser").val();
        if(user != "")
            $("#loginrepo").val(user+".github.io");
        else
            $("#loginrepo").val("");
    });
    $("#editmd").on("dragenter", function(e) {
        e.stopPropagation();
        e.preventDefault();
    });
    $("#editmd").on("dragover", function(e) {
        e.stopPropagation();
        e.preventDefault();
    });
    $("#editmd").on("drop", function(e) {
        e.stopPropagation();
        e.preventDefault();
        var a = e.originalEvent;
        var files = a.target.files || a.dataTransfer && a.dataTransfer.files;
        var tmp = null;
        for (var i = 0; i < files.length; i++) {
            if (files[i].type.match("image.*")) {
                tmp = files[i];
                break;
            }
        }
        if (tmp != null) {
            var reader = new FileReader();
            reader.onload = function() {
                var name = tmp.name;
                var data = reader.result;
                var cursor = $("#editmd")[0].selectionStart;
                var content = $("#editmd").val();
                var l = content.length;
                var head = content.substring(0, cursor);
                var tail = content.substring(cursor, l);
                var url = " ![](//"+global.user+".github.io/";
                if(site_repo != global.user + ".github.io") {
                    url += site_repo+"/";
                }
                url += "img/"+name+")";
                $("#editmd").val(head+"<span class=\"loading\">upload image now!</span>"+tail);
                mdupdate();
                repo.write(site_branch, "img/"+name, data, "upload image",
                           function(e) {
                               if (typeof err != "undefined" && err != null) {
                                   console.log(err);
                                   $("#editmd").val(head+"upload image failed"+tail);
                               }
                               else {
                                   $("#editmd").val(head+url+tail);
                               }
                               mdupdate();
                });
            };
            reader.readAsArrayBuffer(tmp);
        }
    });
});
