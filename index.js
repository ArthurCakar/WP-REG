const fs = require('fs');
const { Client, Intents, Collection } = require('discord.js');
require('dotenv').config({ override: true });

const prefix = process.env.PREFIX || '!';
const client = new Client({ intents:3276543 });

const token = process.env.DISCORD_TOKEN;
if (!token || token.includes('your-bot-token-here')) {
  console.error('DISCORD_TOKEN is missing or still set to a placeholder. Create a .env file with a real bot token.');
  process.exit(1);
}

client.commands = new Collection();
if (fs.existsSync('./commands')) {
  const commandFiles = fs.readdirSync('./commands').filter(f => f.endsWith('.js'));
  for (const file of commandFiles) {
    const command = require(`./commands/${file}`);
    client.commands.set(command.name, command);
  }
}

const { startSignup } = require('./lib/signupManager');
const eventConfig = require('./config/eventConfig');

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);

  const mainSize = parseInt(process.env.SIGNUP_MAIN_SIZE, 10) || 10;
  const subsSize = parseInt(process.env.SIGNUP_SUBS_SIZE, 10) || 5;
  const top5RoleId = process.env.TOP5_ROLE_ID || null;
  const top10RoleId = process.env.TOP10_ROLE_ID || null;
  const informalRoleId = '1451593450196832347';
  const rpTicketRoleId = '1451602138298847233';
  const otherEventsRoleId = '1451593555964592460';

 
  eventConfig.forEach(event => {
    const { name, channel: channelId, durationMinutes, times, everyHourAtMinute, mainSize: eventMainSize, subsSize: eventSubsSize, vcChannelId } = event;
    const eventMainSize_final = eventMainSize || mainSize;
    const eventSubsSize_final = eventSubsSize || subsSize;
    const isInformal = name === 'Informal';

    const isPostableTextChannel = channel => {
      if (!channel) return false;
      if (typeof channel.isTextBased === 'function') return channel.isTextBased();
      if (typeof channel.isText === 'function') return channel.isText();
      return false;
    };

    const rolePingId = isInformal ? informalRoleId : (name === 'RP Ticket' ? rpTicketRoleId : otherEventsRoleId);

    const SAUDI_OFFSET_HOURS = 3;

    if (everyHourAtMinute !== undefined) {
      
      const scheduleInformal = async () => {
        const channel = await client.channels.fetch(channelId).catch(err => null);
        if (!isPostableTextChannel(channel)) return;
        try {
          await startSignup({ 
            channel, 
            type: name, 
            mainSize: eventMainSize_final, 
            subsSize: eventSubsSize_final, 
            durationMs: durationMinutes * 60 * 1000,
            top5RoleId: isInformal ? null : top5RoleId,
            top10RoleId: isInformal ? null : top10RoleId,
            rolePingId,
            useRoleHierarchy: false,
            vcChannelId
          });
        } catch (err) {
          console.error(`Failed to start ${name} signup:`, err);
        }
      };

     
      // Compute next occurrence where configured minute is in Saudi time (UTC+3)
      const now = new Date();
      const saudiNow = new Date(now.getTime() + SAUDI_OFFSET_HOURS * 60 * 60 * 1000);
      let nextSaudi = new Date(saudiNow);
      nextSaudi.setMinutes(everyHourAtMinute);
      nextSaudi.setSeconds(0);
      nextSaudi.setMilliseconds(0);
      if (nextSaudi <= saudiNow) nextSaudi = new Date(nextSaudi.getTime() + 60 * 60 * 1000);
      const next = new Date(nextSaudi.getTime() - SAUDI_OFFSET_HOURS * 60 * 60 * 1000);
      const delay = next - now;

      setTimeout(() => {
        scheduleInformal();
        setInterval(scheduleInformal, 60 * 60 * 1000); 
      }, delay);

      console.log(`Scheduled ${name} every hour at :${everyHourAtMinute}`);
    } else if (times && times.length) {
     
      times.forEach(({ hour, minute }) => {
        const scheduleEvent = async () => {
          const channel = await client.channels.fetch(channelId).catch(err => null);
          if (!isPostableTextChannel(channel)) return;
          try {
            await startSignup({ 
              channel, 
              type: name, 
              mainSize: eventMainSize_final, 
              subsSize: eventSubsSize_final, 
              durationMs: durationMinutes * 60 * 1000,
              top5RoleId,
              top10RoleId,
              rolePingId,
              useRoleHierarchy: false,
              vcChannelId
            });
          } catch (err) {
            console.error(`Failed to start ${name} signup at ${hour}:${minute}:`, err);
          }
        };

        
        const now = new Date();
        // Interpret configured hour/minute as Saudi local time (UTC+3). Compute the UTC instant
        const nextUtcMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour - SAUDI_OFFSET_HOURS, minute, 0, 0);
        let next = new Date(nextUtcMs);
        if (next <= now) next = new Date(next.getTime() + 24 * 60 * 60 * 1000);
        const delay = next - now;

        setTimeout(() => {
          scheduleEvent();
          setInterval(scheduleEvent, 24 * 60 * 60 * 1000);
        }, delay);

        console.log(`Scheduled ${name} daily at ${hour}:${minute}`);
      });
    }
  });

  console.log('All event signups scheduled.');
});

client.on('messageCreate', async message => {
  if (!message.content.startsWith(prefix) || message.author.bot) return;
  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const commandName = args.shift().toLowerCase();
  const command = client.commands.get(commandName);
  if (!command) return;
  try {
    await command.execute(message, args);
  } catch (error) {
    console.error(error);
    message.reply('There was an error executing that command.');
  }
});

client.login(token).catch(error => {
  console.error('Discord login failed. The token is invalid, revoked, or copied incorrectly.');
  console.error('Generate a new bot token in the Discord Developer Portal, put it in .env, then try again.');
  console.error(error);
  process.exit(1);
});