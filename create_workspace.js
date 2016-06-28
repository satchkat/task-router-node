#!/usr/bin/env node
"use strict";

var program   = require('commander'),
    Q = require('q'),
    workspaceHelper = require('./lib/workspace'),
    util = require('util'),
    fs = require('fs');

var hostValue, phoneNumbers;

program
  .version('0.0.1')
  .arguments('<host> <bob_number> <alice_number>')
  .description('Creates and configures a Twilio\'s TaskRouter Workspace.')
  .action(function (host, bobNumber, aliceNumber){
    hostValue        = host;
    phoneNumbers = {
      Bob: bobNumber,
      Alice: aliceNumber
    };
  });

program.parse(process.argv);

if(!hostValue || !phoneNumbers){
  program.outputHelp();
  process.exit(1);
}

function exitErrorHandler(error) {
  console.error('An error occurred:');
  console.error(error);
  process.exit(1);
}

var workspaceJson = JSON.parse(fs.readFileSync('workspace.json', 'utf8'));

workspaceHelper.deleteByName(workspaceJson.name).then(function(){
  var eventCallback = util.format(workspaceJson.event_callback, hostValue);
  return workspaceHelper.create(workspaceJson.name, eventCallback).then(function(workspace){
    console.log('Workspace "%s" created, eventCallback is %s', workspaceJson.name, eventCallback);

    workspace.activities.list().then(function(response){
      var idleActivity = response.activities.find(byName('Idle'));
      var busyActivity = response.activities.find(byName('Busy'));
      var reservedActivity = response.activities.find(byName('Reserved'));

      workspaceJson.workers.forEach(function (workerJson) {
        var workerAttributes = util.format(JSON.stringify(workerJson.attributes), phoneNumbers[workerJson.name]);
        console.log('Creating worker %s with attributes %s', workerJson.name, workerAttributes);
        workspace.workers.create({
          friendlyName: workerJson.name,
          attributes: workerAttributes,
          activitySid: idleActivity.sid
        }).catch(exitErrorHandler);
      });

      Q.all(workspaceJson.task_queues.map(function(taskQueueJson){
        return workspace.taskQueues.create({
          friendlyName: taskQueueJson.name,
          targetWorkers: taskQueueJson.targetWorkers,
          assignmentActivitySid: busyActivity.sid,
          reservationActivitySid: reservedActivity.sid
        }).then(function(taskQueue){
          console.log('"%s" Task Queue created, targeting "%s".', taskQueue.friendly_name, taskQueue.target_workers);
          return taskQueue;
        });
      })).catch(exitErrorHandler);
    });
  }).catch(exitErrorHandler);
}).catch(exitErrorHandler);

function byName(name){
  return function(item) {
    return item.friendly_name === name;
  };
}
