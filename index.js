'use strict'

const fs = require('fs'),
util = require('util'),
moment = require('moment'),
logger = require('winston');

logger.cli();

function extractLiveList(list, channel) {
	let items = [];
	list.forEach(function(live){
		let liveId = live.liveId;
		let liveSid = live.sid;
		let liveName = live.liveName.replace(/,/g, '');
		let liveDesc = live.liveDesc.replace(/,/g, '');
		let watching = live.users;
		items.push([
				channel.name,
				liveId,
				liveSid,
				liveName,
				liveDesc,
				watching
			].join());
	});
	return items;
}

function Spider() {
    this.name = 'yylive';
}

Spider.prototype = {
    onInit:function(done) {
		this.resultDir = './result/';
		this.resultFile = util.format('yylive.%s.csv', moment().format('YYYY-MM-DD'));
		if(!fs.existsSync(this.resultDir)){
		    fs.mkdirSync(this.resultDir);
		}
		fs.writeFileSync(this.resultDir+this.resultFile, '\ufeff');
		this.seed = {
			opt:{
				uri:'http://data.3g.yy.com/nav/v3/infoList',
				qs:{
					'osVersion':'4.4.4',
					'imei':'622266312844051',
					'uid':'0',
					'os':'android',
					'yyVersion':'4.5.1',
					'model':'TiantianVM',
					'ispType':'1',
					'channel':'official',
					'netType':'2'
				}
			},
			next:'getChannel'
		}
		done();
    },
    onData:function(dataSet) {
		if(dataSet.get('data')) {
		    fs.appendFileSync(this.resultDir+this.resultFile, dataSet.get('data'));
		}
    },
    getChannel:function(ctx, done) {
    	let data = null;
    	try {
    		data = JSON.parse(ctx.content);
    	} catch(e) {
    		logger.error('Get channel failed: %s', e);
    		done();
    		return;
    	}

    	let channels = [];
    	data.data.forEach(function(channel){
    		channels.push({
    			name:channel.tabName,
    			dataCode:channel.dataCode,
    			subDataCode:channel.subDataCode
    		});
    	});

    	channels.forEach(function(channel){
    		if(!channel.dataCode) {
    			ctx.tasks.push({
    				opt:{
    					uri:'http://d.3g.yy.com/index/v4/infoList',
    					qs:{
    						'totalCount':'0',
							'osVersion':'4.4.4',
							'imei':'622266312844051',
							'uid':'0',
							'os':'android',
							'page':1,
							'yyVersion':'4.5.1',
							'model':'TiantianVM',
							'ispType':'1',
							'channel':'official',
							'netType':'2'
    					},
    					params:{
    						channel:channel
    					}
    				},
    				next:'getList'
    			})
    		} else {
    			ctx.tasks.push({
	    			opt:{
	    				uri:'http://data.3g.yy.com/data/liveList',
	    				qs:{
	    					'osVersion':'4.4.4',
							'imei':'622266312844051',
							'uid':'0',
							'os':'android',
							'subDataCode':channel.subDataCode,
							'page':1,
							'yyVersion':'4.5.1',
							'model':'TiantianVM',
							'ispType':'1',
							'dataCode':channel.dataCode,
							'channel':'official',
							'netType':'2'
	    				},
	    				params:{
	    					channel:channel
	    				}
	    			},
	    			next:'getList'
	    		});
    		}
    	});

    	logger.info('Got %s channels', channels.length);

    	done();
    },
    getList:function(ctx, done) {
    	let channel = ctx.params.channel;
    	delete ctx.params.channel;
    	let page = ctx.params.page;

    	let data = null;
    	try {
    		data = JSON.parse(ctx.content);
    	} catch(e) {
    		logger.error('[Channel %s, page %s] get list json parse failed: %s', channel.name, page, e);
    		done();
    		return;
    	}

    	let items = [];

    	if(channel.name == '热门') {
    		data.data.moduleList.forEach(function(module){
    			if(module.moduleName == 'banner') {
    				return;
    			}
    			items = items.concat(extractLiveList(module.dataList, channel));
    		});
    	} else {
    		items = extractLiveList(data.data.liveList, channel);	
    	}

    	logger.info('[Channel %s, page %s] got %s live shows', channel.name, page, items.length);

    	if(items.length) {
    		ctx.dataSet.set('data', items.join('\n')+'\n');
    		++page;
    		ctx.params.page = page;
    		if(channel.name == '热门') {
    			ctx.tasks.push({
    				opt:{
    					uri:'http://d.3g.yy.com/index/v4/infoList',
    					qs:ctx.params,
    					params:{
    						channel:channel
    					}
    				},
    				next:'getList'
    			});
    		} else {
    			ctx.tasks.push({
    				opt:{
    					uri:'http://data.3g.yy.com/data/liveList',
    					qs:ctx.params,
    					params:{
    						channel:channel
    					}
    				},
    				next:'getList'
    			});
    		}
    	}

    	done();
    }
}

const Flowesh = require('flowesh'),
charsetparser = require('mof-charsetparser'),
iconv = require('mof-iconv'),
cheerio = require('mof-cheerio'),
normalizer = require('mof-normalizer'),
reqadapter = require('mof-reqadapter');

const env = 'development';
const config = require('./config.json')[env];

const flowesh = new Flowesh(config).attach(new Spider());

flowesh.requestmw.use(normalizer());
flowesh.requestmw.use(reqadapter());

flowesh.responsemw.use(charsetparser());
flowesh.responsemw.use(iconv());
flowesh.responsemw.use(cheerio());

flowesh.start();