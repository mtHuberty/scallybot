const Discord = require('discord.js');
const logger = require('winston');
const chrono = require('chrono-node');
const dateFormat = require('dateformat');
const auth = require('./auth.json');
const { Client } = require('pg');

const client = new Client({
    user: 'scallybot',
    host: 'localhost',
    database: 'scallybot',
    password: 'scurvy',
    port: 5432
});

client.connect((err) => {
    if (err) {
        logger.error(err);
    } else {
        console.log('Connected to Postgres!');
    }
});

// Logger settings
logger.remove(logger.transports.Console);
logger.add(new logger.transports.Console, {
    colorized: true
})
logger.level = 'debug';










// Start the bot
const bot = new Discord.Client();

bot.login(auth.token);

bot.on('ready', () => {
    console.log('Bot is on and ready!!!!');
})

bot.on('message', (message) => {
    if (message.content.startsWith('!')) {
        let messageArray = message.content.substring(1).split(' ');
        const command = messageArray[0].toLowerCase();

        switch(command) {
            case 'ping':
                message.channel.send('pong');
                break;
            case 'scheduleraid':
                scheduleraid(message);
                break;
            case 'listraids':
                listraids(message);
                break;
            case 'register':
                register(message);
                break;
            case 'signup':
                signup(message);
                break;
            case 'listsignups':
                listsignups(message);
                break;
        }
    }
})

function scheduleraid(message) {
    if (message.author.id == '176213323266654208' || true) { //TODO: remove the || true section to restrict this function
        const userName = message.author.username;
        const userID = message.author.id;
        // Using this filter should ensure that it only listens for messages from the author that sent the first ! command for the rest of this section
        const filter = msg => msg.author.id == message.author.id;
        const timeLimit = 120000;
        const options = {
            maxMatches: 1,
            time: timeLimit,
            errors: ['time']
        }
        message.channel.send(`Hi ${userName}! Which raid will it be? (raid name)`);
        message.channel.awaitMessages(filter, options)
            .then(raidCollection => {
                let raidName = raidCollection.first().content;
                message.channel.send(`Alright, ${raidName} it is! What day and time? (m/d hh:mm)`)
                message.channel.awaitMessages(filter, options)
                    .then(timeCollection => {
                        let dateTimeString = timeCollection.first().content; // User date/time input
                        let dateTime = chrono.parseDate(dateTimeString); // Gets saved to database
                        let dateObj = Date.parse(dateTime); // Obj for parsing to format for user

                        let prettyDate = dateFormat(dateObj, "dddd, mmm dS");
                        let prettyTime = dateFormat(dateObj, "h:MMtt");
                        
                        message.channel.send(`
                            You got it.\nJust to confirm, you're running ${raidName} on ${prettyDate} at ${prettyTime}? (yes/no)`
                        );
                        message.channel.awaitMessages(filter, options)
                            .then(confirmation => {
                                if (confirmation.first().content.toLowerCase().includes('yes')) {
                                    message.channel.send('Awesome. I\'ll get that setup for you...');

                                    // Save raid scheduling info to postgres
                                    let query = 'INSERT INTO raids(raidname,timestring,organizerid) VALUES($1,$2,$3);';
                                    console.log('Let\'s execute the query');
                                    client.query(query, [raidName, dateTime, userID], (err, res) => {
                                        if (err) {
                                            message.channel.send('For some reason I couldn\'t save that info to the database.');
                                            console.error(err);
                                        } else {
                                            message.channel.send('Success.');
                                            message.channel.send('Good luck with the raid!');
                                            message.channel.send(res.rows);
                                            logger.debug(`${userName}'s query saved!:
                                            ${res.command} completed successfully at ${Date.now().toLocaleString()}`
                                            );
                                        }
                                    });
                                } else if (confirmation.first().content.toLowerCase().includes('no')) {
                                    message.channel.send('Uh oh, I must have misunderstood. Try scheduling again.');
                                } else {
                                    // This is hacky. We should use recursion.
                                    message.channel.awaitMessages(filter, options)
                                        .then(retryConfirmation => {
                                            // TODO: Figure out why this isn't working. I think it's broken
                                            if (retryConfirmation.first().content.toLowerCase().includes('yes')) {
                                                message.channel.send('Awesome. I\'ll get that setup for you...');
                                            } else if (retryConfirmation.first().content.toLowerCase().includes('no')) {
                                                message.channel.send('Uh oh, I must have misunderstood. Try scheduling again.');
                                            } else {
                                                message.channel.send('I don\'t know what\'s going on. Sorry about this.');
                                            }
                                        })
                                        .catch(confirmation => {
                                            console.log(`Rejected, and here's what we got: ${confirmation}`);
                                            message.channel.send('Whoops. Something went wrong with that request. Tell Juicey to check the logs.');
                                        })
                                }
                            })
                            .catch(confirmation => {
                                console.log(`Rejected, and here's what we got: ${confirmation}`);
                                message.channel.send('Whoops. Something went wrong with that request. Tell Juicey to check the logs.');
                            })
                    })
                    .catch(timeCollection => {
                        console.log(`Rejected, and here's what we got: ${timeCollection}`);
                        message.channel.send('Whoops. Something went wrong with that request. Tell Juicey to check the logs.');
                    })
            })
            .catch(raidCollection => {
                console.log(`Rejected, request from ${userName} timed out after ${timeLimit/1000} seconds.`);
                message.channel.send('Looks like this "!" request took too long. Try again.');
            })
    }
}

function listraids(message) {
    const query = 'SELECT * FROM raids;'
    client.query(query, (err, res) => {
        if (err) {
            message.channel.send('I had some trouble retrieving the list for you. Ask Juicey wtf he did to my logic.');
            console.error(err);
        } else {
            console.log(res);
            res.rows.forEach((x) => {
                let dateObj = Date.parse(x.timestring); // Obj for parsing to format for user
                let prettyDate = dateFormat(dateObj, "dddd, mmm dS");
                let prettyTime = dateFormat(dateObj, "h:MMtt");
                message.channel.send(`\`\`\`${x.raidname} on ${prettyDate} at ${prettyTime} (id: ${x.raidid})\`\`\``);
            });
        }
    });
}

function register(message) {
    const query = `INSERT INTO players (playerid,playername) VALUES ($1,$2) ON CONFLICT (playerid) DO UPDATE SET playername=$2;`;
    client.query(query, [message.author.id, message.author.username], (err, res) => {
        if (err) {
            message.channel.send(`I had trouble saving your info. Try again later or ask Juicey about it.`);
            console.error(err);
        } else {
            message.channel.send(`Alright, ${message.author.username}, You're good to go! You can now use "!signup" to sign up for a raid.`);
            console.log(res);
        }
    });
}

function signup(message) {
    const query = 'SELECT * FROM raids;'
    client.query(query, (err, res) => {
        if (err) {
            message.channel.send('I had some trouble starting the signup process. Ask Juicey wtf he did to my logic.');
            console.error(err);
        } else {
            if (res.rows.length == 1) {
                const onlyRaid = res.rows[0];
                let dateObj = Date.parse(onlyRaid.timestring); // Obj for parsing to format for user
                let prettyDate = dateFormat(dateObj, "dddd, mmm dS");
                let prettyTime = dateFormat(dateObj, "h:MMtt");
                message.channel.send('I found one raid scheduled:');
                message.channel.send(`\`\`\`${onlyRaid.raidname} on ${prettyDate} at ${prettyTime} (id: ${onlyRaid.raidid})\`\`\``);
                message.channel.send('Would you like to signup for this raid? (yes/no)');
                
                // awaitMessages options
                const filter = msg => msg.author.id == message.author.id;
                const timeLimit = 120000;
                const options = {
                    maxMatches: 1,
                    time: timeLimit,
                    errors: ['time']
                }

                message.channel.awaitMessages(filter, options)
                    .then(confirmation => {
                        const confirmationResponse = confirmation.first().content.toString().toLowerCase();
                        switch (confirmationResponse) {
                            case 'no':
                            case 'n':
                                message.channel.send('Alright, nevermind then.');
                                break;
                            case 'yes':
                            case 'y':
                            case 'ye':
                                const checkSignupStatusQuery = 'SELECT playerid FROM signups WHERE playerid=$1;';
                                client.query(checkSignupStatusQuery, [message.author.id], (err, res) => {
                                    if (err) {
                                        console.error(err);
                                        errMsg(message); //TODO: Replace all errors with errMsg function call
                                    } else {
                                        if (res.rows.length == 0) {
                                            message.channel.send('What main role would you prefer? (Choose ONE of: DPS, Healer, or Tank)');
                                            message.channel.awaitMessages(filter, options)
                                                .then(roleResponse => {
                                                    const roleChoice = roleResponse.first().content.toString().toLowerCase();
                                                    let role;
                                                    switch (roleChoice) {
                                                        case 'dps':
                                                        case 'damage':
                                                        case 'deeps':
                                                            role = 'DPS';
                                                            break;
                                                        case 'heals':
                                                        case 'heal':
                                                        case 'healer':
                                                        case 'hps':
                                                            role = 'Healer';
                                                            break;
                                                        case 'tank':
                                                        case 'tnk':
                                                            role = 'Tank';
                                                            break;
                                                    }

                                                    const signupQuery = 'INSERT INTO signups (playerid, raidid, mainrole) VALUES ($1,$2,$3) ON CONFLICT (playerid) DO UPDATE SET mainrole=$3;';
                                                    client.query(signupQuery, [message.author.id, onlyRaid.raidid, role], (err, res) => {
                                                        if (err) {
                                                            console.error(err);
                                                            errMsg(message);
                                                        } else {
                                                            message.channel.send(`Sounds good, ${message.author.username}, you're signed up as a ${role} for ${onlyRaid.raidname}`);
                                                        }
                                                    });
                                                })
                                                .catch(role => {
                                                    errMsg(message);
                                                })
                                        } else if (res.rows.length == 1) {
                                            message.channel.send(`Looks like you're already signed up, ${message.author.username}! See you there.`);
                                            message.channel.send(`(If you want to cancel this signup, use "!cancel")`);
                                            return;
                                        } else {
                                            errMsg(message, `Somehow it looks like you're signed up more than once. No idea how that happened. Tell Juicey.`);
                                            return;
                                        }
                                    }
                                });
                                break;
                        }
                    })
                    .catch(confirmation => {
                        console.log(`Rejected, and here's what we got: ${confirmation}`);
                        message.channel.send('Whoops. Something went wrong with that request. Tell Juicey to check the logs.');
                    })
            } else if (res.rows.length == 0) {
                message.channel.send('It looks like there aren\'t any raids scheduled right now. Check back later.');
            } else {
                console.log(res);
                res.rows.forEach((x) => {
                    let dateObj = Date.parse(x.timestring); // Obj for parsing to format for user
                    let prettyDate = dateFormat(dateObj, "dddd, mmm dS");
                    let prettyTime = dateFormat(dateObj, "h:MMtt");
                    message.channel.send(`\`\`\`${x.raidname} on ${prettyDate} at ${prettyTime} (id: ${x.raidid})\`\`\``);
                });
            }
            
        }
    });
}

function listsignups(message) {
    const query = 'SELECT * FROM players LEFT OUTER JOIN signups ON (players.playerid = signups.playerid);'
    client.query(query, (err, res) => {
        if (err) {
            message.channel.send('I had some trouble retrieving the list for you. Ask Juicey wtf he did to my logic.');
            console.error(err);
        } else {
            console.log(res);
            // res.rows.forEach((x) => {
            //     let dateObj = Date.parse(x.timestring); // Obj for parsing to format for user
            //     let prettyDate = dateFormat(dateObj, "dddd, mmm dS");
            //     let prettyTime = dateFormat(dateObj, "h:MMtt");
            //     message.channel.send(`\`\`\`${x.raidname} on ${prettyDate} at ${prettyTime} (id: ${x.raidid})\`\`\``);
            // });
        }
    });
}

function errMsg(msg, str) {
    if (msg.channel) {
        if (str) {
            return msg.channel.send(str);
        } else {
            return msg.channel.send('Whoops. Something went wrong. Tell Juicey to check the logs.');
        }
    } else {
        console.log(`msg param has no channel`);
        return;
    }
}

/*########### Pre-exit scripts ############*/
let preExit = [];

// Catch exit
process.stdin.resume();
process.on ('exit', code => {
  let i;

  console.log ('Process exit');

  for (i = 0; i < preExit.length; i++) {
    preExit[i] (code);
  }

  process.exit (code);
});

// Catch CTRL+C
process.on ('SIGINT', () => {
  console.log ('\nCTRL+C...');
  process.exit (0);
});

// Catch uncaught exception
process.on ('uncaughtException', err => {
  console.dir (err, { depth: null });
  process.exit (1);
});


// INSERT CODE
console.log ('App running...');

// Add pre-exit script
preExit.push (code => {
  console.log ('Whoa! Exit code %d, cleaning up...', code);
  client.end()
});