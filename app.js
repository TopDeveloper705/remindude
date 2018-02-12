process.chdir(__dirname);

const moment = require('moment');
const _ = require('lodash');
const fs = require('fs');

let config = JSON.parse(fs.readFileSync('config.json')); // read config
let timetable = JSON.parse(fs.readFileSync('timetable.json')); // read timetable
let reminders = JSON.parse(fs.readFileSync('reminders.json')); // read reminders
const bot = (new (require('node-telegram-bot-api'))(config.token, { polling: true }));

// set interval for checking and processing timetable
setInterval(processTimetable, 2500);

// send "bot start event message" if we have ownerId in config
if (config.ownerId) {
	bot.sendMessage(config.ownerId, config.replies.started);
}

// on /start from user
bot.onText(/\/start/, function (msg, match) {
	bot.sendMessage(msg.from.id, config.replies.disclaimer);
});

// on message to set reminder, for instance:
// 1102 1200 buy some milk
// 1102 1200 24ч 30м 15m 5m 1h get more cookies!
// test regular expression here: https://regex101.com/r/J5XQsV/3/tests
bot.onText(/\s*(\d{4})\s+(\d{4})((\s*\d+[dhmдчм]){0,})(.+)/i, function (msg, match) {

	// check sender, just return if we have ownerId in config and this is not this Telegram user
	if (config.ownerId && ownerId != msg.from.id) {
		bot.sendMessage(msg.from.id, config.replies.notAllowed);
		return;
	}

	bot.sendMessage(msg.from.id, createReminder(reminders, msg.text, match, msg.from.id) ? config.replies.ok : config.replies.error);

});


// function to set reminder with data from message 
function createReminder(reminders, text, match, userId) {

	let mainDate = new Date(2018,
		match[1].substr(2, 2) * 1 - 1,
		match[1].substr(0, 2) * 1,
		match[2].substr(0, 2) * 1,
		match[2].substr(2, 2) * 1
	);

	let reminder = {
		text: text,
		match: match,
		userId: userId,
		msg: _.trim(match[5]),
		deleted: false,
		dt: moment(mainDate).format('DD.MM.YYYY HH:mm')
	}

	// set timestamp for main date of reminder
	setTimestapForReminder(timetable, mainDate.getTime(), reminders.length);

	// check for pre-reminders
	if (match[3]) {
		_.trim(match[3]).split(' ').forEach(function (el) {
			if (el) {
				let arr = el.split('');
				let symbol = arr.pop().toLocaleLowerCase();
				let nums = arr.join('') * 1;
				let msymbol;
				switch (symbol) {
					case 'ч':
					case 'h':
						msymbol = 'hours';
						break;
					case 'd':
					case 'д':
						msymbol = 'days';
						break;
					case 'м':
					case 'm':
						msymbol = 'minutes';
						break;
				}

				setTimestapForReminder(timetable, moment(mainDate).subtract(nums, msymbol).toDate().getTime(), reminders.length);

			}
		})
	}

	reminders.push(reminder);

	fs.writeFile('reminders.json', JSON.stringify(reminders), () => { }); // flush to disk
	fs.writeFile('timetable.json', JSON.stringify(timetable), () => { }); // flush to disk

	return true;
}

// save into timetable
function setTimestapForReminder(timetableObject, timestamp, reminderIndex) {
	// each value in timetable[{timestamp}] is an array
	timetableObject[timestamp] = timetableObject[timestamp] || [];
	timetableObject[timestamp].push({
		reminderIndex: reminderIndex, // points to reminder index
		done: false // will set to true after processing and sending message to user
	});
}

// check and send if we have any on current timestamp
function processTimetable() {
	let ts = Math.floor(Date.now() / 10000) * 10000;
	let dirtyTimetable = false;
	if (timetable[ts]) {
		for (var i = 0; i < timetable[ts].length; i++) {
			if (!timetable[ts][i].done) {
				let reminder = reminders[timetable[ts][i].reminderIndex];
				if (!reminder.deleted) {
					bot.sendMessage(reminder.userId, reminder.msg + '\n' + '@ ' + reminder.dt);
					dirtyTimetable = true;
				}
			}
			timetable[ts][i].done = true;
		}
	}
	if (dirtyTimetable) {
		fs.writeFile('timetable.json', JSON.stringify(timetable), () => { }); // flush to disk
	}
}