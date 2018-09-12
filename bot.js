const Discord = require('discord.io');
const logger = require('winston');
const auth = require('./auth.json');
const { Client } = require('pg');

const client = new Client({
    user: 'scallybot',
    host: 'localhost',
    database: 'scallybot',
    password: 'scurvy',
    port: 5432
});

client.connect();

// Logger settings
logger.remove(logger.transports.Console);
logger.add(new logger.transports.Console, {
    colorized: true
})
logger.level = 'debug';

// Start the bot
const bot = new Discord.Client({
    token: auth.token,
    autorun: true
});
bot.on('ready', (event) =>{
    logger.info('Scallybot connected!');
    logger.info(`Logged in as: ${bot.username} + -(${bot.id})`);
});

// Listen for messages?
let ravioliCounter = 0;
let ravioli = ["Ravioli", "ravioli", "give me", "the formuoli."];

bot.on('message', (user, userID, channelID, message, event) => {
    if (user == 'DrewTaku') {
        bot.sendMessage({
            to: channelID,
            message: ravioli[ravioliCounter]
        });
        ravioliCounter++;
        if (ravioliCounter == (ravioli.length - 1)) {
            ravioliCounter = 0;
        }
    }
    if (message.substring(0,1) == '!') {
        let args = message.substring(1).split(' ');
        let cmd = args[0];
        args.shift();
        let msg = args.join(' ');

        logger.debug(args.splice(1));

        switch(cmd) {
            case 'ping':
                bot.sendMessage({
                    to: channelID,
                    message: 'Pong!'
                });
                break;
            case 'what':
                client.query('Select * from test;', (err, res) => {
                    if (err) {
                        bot.sendMessage({
                            to: channelID,
                            message: 'Sorry. Something went wrong. Blame Juicey.'
                        });
                        logger.error(err.stack);
                    } else {
                        bot.sendMessage({
                            to: channelID,
                            message: res.rows[0].name + ' said "' + res.rows[0].message + '"'
                        });
                        // logger.debug(res.rows[0]);
                    }
                });
                break;
            case 'storemessage':
                client.query('Insert into test(name,message) VALUES($1,$2);', [user, msg], (err, res) => {
                    if (err) {
                        bot.sendMessage({
                            to: channelID,
                            message: 'Sorry. Something went wrong. Blame Juicey.'
                        });
                        logger.error(err.stack);
                    } else {
                        logger.debug(`Stored ${msg} from ${userID}`);
                        // logger.debug(res.rows[0]);
                    }
                });
                break;
            case 'readmessage':
                client.query('SELECT id,name,message FROM test ORDER BY id DESC LIMIT 1', (err, res) => {
                    if (err) {
                        bot.sendMessage({
                            to: channelID,
                            message: 'Sorry. Something went wrong. Blame Juicey.'
                        });
                        logger.error(err.stack);
                    } else {
                        bot.sendMessage({
                            to: channelID,
                            message: `${res.rows[0].name} said "${res.rows[0].message}"`
                        });
                    }
                });
                break;
        }
    }
});


// Pre-exit scripts
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
console.log ('App ready - hit CTRL+C ;)');

// Add pre-exit script
preExit.push (code => {
  console.log ('Whoa! Exit code %d, cleaning up...', code);
  client.end()
});