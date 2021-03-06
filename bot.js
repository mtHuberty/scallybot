const Discord = require('discord.js');
const logger = require('winston');
const chrono = require('chrono-node');
const dateFormat = require('dateformat');
const schedule = require('node-schedule');
const auth = require('./auth.json');
const { Client } = require('pg');

// Setup database connection client
const client = new Client({
    user: 'scallybot',
    host: 'localhost',
    database: 'scallybot',
    password: 'scurvy',
    port: 5432
});

// Connect to PostgreSQL
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
    bot.guilds.tap((guild) => {
        guild.members.tap((mem) => {
            console.log(mem.nickname || mem.user.username);
        })
    })
})

// Schedule Reminders for 1 Hour before raid
const schedulerQuery = 'SELECT signups.playerid, raids.timestring FROM signups INNER JOIN raids ON signups.raidid = raids.raidid ORDER BY signups.raidid ASC;';
client.query(schedulerQuery, [], (err, res) => {
    let playeridSchedArray = [];
    let timeObjSchedArray = [];
    if (err) {
        console.error(err.message);
    } else {
        res.rows.forEach(row => {
            playeridSchedArray.push(row.playerid);
            let raidUnixTime = Date.parse(row.timestring);
            timeObjSchedArray.push(raidUnixTime - 3600);
        });
        playeridSchedArray.forEach((playerid,ind) => {
            console.log(`Scheduling reminder for player ${playerid} at ${timeObjSchedArray[ind]}`);
            schedule.scheduleJob(timeObjSchedArray[ind], () => {
                bot.users.get(playerid).send("This is a friendly reminder that your raid is starting soon!!");
            })
        })
    }
    console.log("Reminders are scheduled!");
})


bot.on('message', (message) => {
    if (message.content.trim().startsWith('!')) {
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
            case 'raids':
                listraids(message);
                break;
            case 'signup':
                signup(message);
                break;
            case 'listsignups':
            case 'signups':
                listsignups(message);
                break;
            case 'cancelsignup':
            case 'cancelsignups':
            case 'cancel':
                cancelsignup(message);
                break;
        }
    }
})

bot.on('guildMemberUpdate', (oldMember, newMember) => {
    if (oldMember.user.id == 155051241028714497) {

    }
    console.log(`Someone changed their name from ${oldMember.displayName} to ${newMember.displayName}`);

})

bot.on('userUpdate', (oldUser, newUser) => {
    if (oldUser.id == 155051241028714497) {
        console.log(`JOSH changed his name from ${oldUser.username} to ${newUser.username}`);
    }
    console.log(`Someone changed their name from ${oldUser.username} to ${newUser.username}`);
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

function signup(message) {

    // First attempt to "register" any player that's not already in the players table
    const registerQuery = `INSERT INTO players (playerid,playername) VALUES ($1,$2) ON CONFLICT (playerid) DO UPDATE SET playername=$2;`;
    client.query(registerQuery, [message.author.id, message.author.username], (err, res) => {
        if (err) {
            message.channel.send(`I had trouble saving your info. Try again later or ask Juicey about it.`);
            console.error(err);
        }
    });

    // 
    const raidQuery = 'SELECT * FROM raids;';
    client.query(raidQuery, (err, res) => {
        if (err) {
            message.channel.send('I had some trouble starting the signup process. Ask Juicey wtf he did to my logic.');
            console.error(err);
        } else {
            //TODO check that raids are actually scheduled in future, like in else statement below.
            if (res.rows.length > 1) {
                console.log(res);
                message.channel.send("I found the following raids scheduled:");
                const scheduledRaidIds = [];
                const raidIdToName = {};
                res.rows.forEach((x) => {
                    let raidTimeUnix = Date.parse(x.timestring); // Obj for parsing to format for user
                    if (raidTimeUnix > Date.now()) {
                        let prettyDate = dateFormat(raidTimeUnix, "dddd, mmm dS");
                        let prettyTime = dateFormat(raidTimeUnix, "h:MMtt");
                        message.channel.send(`\`\`\`${x.raidname} on ${prettyDate} at ${prettyTime} (id: ${x.raidid})\`\`\``);
                        scheduledRaidIds.push(x.raidid);
                        raidIdToName[x.raidid] = x.raidname;
                    }
                });
                message.channel.send("Please enter the ID of the raid you would like to signup for. (e.g. 6)");
                const filter = msg => msg.author.id == message.author.id;
                const timeLimit = 120000;
                const options = {
                    maxMatches: 1,
                    time: timeLimit,
                    errors: ['time']
                }
                message.channel.awaitMessages(filter, options)
                    .then(confirmation => {
                        const raidIdResponse = confirmation.first().content.toString().toLowerCase();
                        const raidIdInt = parseInt(raidIdResponse);

                        // Start new logic
                        if (scheduledRaidIds.includes(raidIdInt)) {
                            const checkSignupStatusQuery = 'SELECT playerid FROM signups WHERE playerid=$1;';
                            client.query(checkSignupStatusQuery, [message.author.id], (err, res) => {
                                if (err) {
                                    console.error(err);
                                    errMsg(message); //TODO: Replace all errors with errMsg function call
                                } else {
                                    const alreadySignedUpRaidIds = [];
                                    res.rows.forEach(row => {
                                        alreadySignedUpRaidIds.push(row.raidid);
                                    })
                                    if (!alreadySignedUpRaidIds.includes(raidIdInt)) {
                                        message.channel.send('What main role would you prefer? (Choose ONE of: DPS, Healer, or Tank)');
                                        message.channel.awaitMessages(filter, options)
                                            .then(roleResponse => {
                                                const roleChoice = roleResponse.first().content.toString().toLowerCase();
                                                let role;
                                                switch (roleChoice) {
                                                    case '!dps':
                                                    case 'dps':
                                                    case 'damage':
                                                    case 'deeps':
                                                        role = 'DPS';
                                                        break;
                                                    case '!heals':
                                                    case 'heals':
                                                    case 'heal':
                                                    case 'healer':
                                                    case 'hps':
                                                        role = 'Healer';
                                                        break;
                                                    case '!tank':
                                                    case 'tank':
                                                    case 'tnk':
                                                        role = 'Tank';
                                                        break;
                                                    default:
                                                        message.channel.send('That doesn\'nt look like a role I understand. Try again.');
                                                        return;
                                                }

                                                const signupQuery = 'INSERT INTO signups (playerid, raidid, mainrole) VALUES ($1,$2,$3) ON CONFLICT (playerid) DO UPDATE SET mainrole=$3;';
                                                client.query(signupQuery, [message.author.id, raidIdInt, role], (err, res) => {
                                                    if (err) {
                                                        console.error(err);
                                                        errMsg(message);
                                                    } else {
                                                        message.channel.send(`Sounds good, ${message.author.username}, you're signed up as a ${role} for ${raidIdToName[raidIdInt]}`);
                                                    }
                                                });
                                            })
                                            .catch(reason => {
                                                console.log(reason);
                                                errMsg(message);
                                            })
                                    } else if (alreadySignedUpRaidIds.includes(raidIdInt)) {
                                        message.channel.send(`Looks like you're already signed up, ${message.author.username}! See you there.`);
                                        message.channel.send(`(If you want to cancel this signup, use "!cancelsignup")`);
                                        return;
                                    } else {
                                        errMsg(message, `You're not signed up...but I think you're somehow also already signed up. My logic is broken. Tell Juicey.`);
                                        return;
                                    }
                                }
                            });
                        } else {
                            errMsg(message, "That doesn't seem to match a scheduled raid. Try again.");
                        }
                        // End new logic
                    })
                    .catch(reason => {
                        console.error(reason);
                        errMsg(message, "Yeah so I can't wait around forever. Let me know when you want to try again.");
                    })
            } else if (res.rows.length == 1 && Date.parse(res.rows[0].timestring) > Date.now()) {
                const onlyRaid = res.rows[0];
                let raidTimeUnix = Date.parse(onlyRaid.timestring); // Obj for parsing to format for user
                let prettyDate = dateFormat(raidTimeUnix, "dddd, mmm dS");
                let prettyTime = dateFormat(raidTimeUnix, "h:MMtt");
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
                                // Using this again above for multiple raid logic. Consider extracting this to a function
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
                                                        case '!dps':
                                                        case 'dps':
                                                        case 'damage':
                                                        case 'deeps':
                                                            role = 'DPS';
                                                            break;
                                                        case '!heals':
                                                        case 'heals':
                                                        case 'heal':
                                                        case 'healer':
                                                        case 'hps':
                                                            role = 'Healer';
                                                            break;
                                                        case '!tank':
                                                        case 'tank':
                                                        case 'tnk':
                                                            role = 'Tank';
                                                            break;
                                                        default:
                                                            message.channel.send('That doesn\'nt look like a role I understand. Try again.');
                                                            return;
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
                                            message.channel.send(`(If you want to cancel this signup, use "!cancelsignup")`);
                                            return;
                                        } else {
                                            errMsg(message, `Somehow it looks like you're signed up more than once. No idea how that happened. Tell Juicey.`);
                                            return;
                                        }
                                    }
                                });
                                break;
                            default:
                                message.channel.send('Sorry, that didn\'t look like a yes or no. I\'m actually kind of stupid so if you could keep it simple, that\'d be great');
                                return;
                        }
                    })
                    .catch(confirmation => {
                        console.log(`Rejected, and here's what we got: ${confirmation}`);
                        message.channel.send('Whoops. Something went wrong with that request. Tell Juicey to check the logs.');
                    })
            } else if (res.rows.length == 0) {
                message.channel.send('It looks like there aren\'t any raids scheduled right now. Check back later.');
            } else {
                // TODO - change/kill this section. Copying code to top of if chain
                // console.log(res);
                // res.rows.forEach((x) => {
                //     let dateObj = Date.parse(x.timestring); // Obj for parsing to format for user
                //     let prettyDate = dateFormat(dateObj, "dddd, mmm dS");
                //     let prettyTime = dateFormat(dateObj, "h:MMtt");
                //     message.channel.send(`\`\`\`${x.raidname} on ${prettyDate} at ${prettyTime} (id: ${x.raidid})\`\`\``);
                // });
            }
            
        }
    });
}

function listsignups(message) {
    const query = 'SELECT * FROM signups INNER JOIN players ON (players.playerid = signups.playerid) INNER JOIN raids ON (signups.raidid = raids.raidid) ORDER BY signups.raidid;';
    client.query(query, (err, res) => {
        if (err) {
            message.channel.send('I had some trouble retrieving the list for you. Ask Juicey wtf he did to my logic.');
            console.error(err);
        } else {
            if (res.rows.length == 0) {
                message.channel.send('There are no sign-ups for any currently scheduled raids.');
                return;
            }
            console.log(res);
            res.rows.forEach((x) => {
                let dateObj = Date.parse(x.timestring); // Obj for parsing to format for user
                let prettyDate = dateFormat(dateObj, "dddd, mmm dS");
                let prettyTime = dateFormat(dateObj, "h:MMtt");
                message.channel.send(`\`\`\`${x.raidname} (id: ${x.raidid}) ${x.playername} - ${x.mainrole}\`\`\``);
            });
        }
    });
}

function cancelsignup(message) {
    const filter = msg => msg.author.id == message.author.id;
    const timeLimit = 120000;
    const options = {
        maxMatches: 1,
        time: timeLimit,
        errors: ['time']
    }
    const query = 'SELECT * FROM players INNER JOIN signups ON (players.playerid = signups.playerid) INNER JOIN raids ON (signups.raidid = raids.raidid) WHERE signups.playerid=$1 ORDER BY signups.raidid;';
    client.query(query, [message.author.id], (err, res) => {
        if (err) {
            message.channel.send('I had some trouble retrieving the list of sign-ups for you. Ask Juicey wtf he did to my logic.');
            console.error(err);
        } else {
            if (res.rows.length == 0) {
                message.channel.send('You don\'t appear to be signed up for any raids at the moment. Try using "!signup" to see the list of raids and fix that.');
                return;
            }
            console.log(res);
            message.channel.send('I found the following sign-ups for your account.');
            const signedUpRaidIds = [];
            res.rows.forEach((x) => {
                let dateObj = Date.parse(x.timestring); // Obj for parsing to format for user
                signedUpRaidIds.push(x.raidid);
                let prettyDate = dateFormat(dateObj, "dddd, mmm dS");
                let prettyTime = dateFormat(dateObj, "h:MMtt");
                message.channel.send(`\`\`\`${x.raidname} (id: ${x.raidid}) ${x.playername} - ${x.mainrole}\`\`\``);
            });
            message.channel.send('If you\'re sure you want to cancel, what is the ID of the raid you need to cancel your signup for?');
            message.channel.awaitMessages(filter, options)
                .then(confirmation => {
                    const raididToCancel = parseInt(confirmation.first().content.trim());
                    console.log(raididToCancel);
                    // Check that the number they entered is in the list of raidids of raids they've signed up for
                    if (signedUpRaidIds.includes(raididToCancel)) {
                        const cancelQuery = 'DELETE FROM signups WHERE raidid=$1 AND playerid=$2;';
                        client.query(cancelQuery, [raididToCancel, message.author.id], (err, res) => {
                            if (err) {
                                console.error(err);
                                message.channel.send('Either that wasn\'t a real raid id or idk what the hell\'s going on. Try again or ask Juicey.');
                            } else {
                                message.channel.send('FINE THEN! WE DON\'T NEED YOU THERE ANYWAY!');
                                message.channel.send('...kidding, catch you at the next one.');
                            }
                        });
                    } else {
                        message.channel.send('That doesn\'t seem to be an id for a raid that you\'re signed up for. Try again.');
                    }
                })
                .catch(reason => {
                    console.error(reason);
                    errMsg(message, "I don't have all day! Let me know when you're ready to try that again.");
                })
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