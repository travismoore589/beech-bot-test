const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, GatewayIntentBits } = require('discord.js');
const responseMessages = require('./modules/response-messages.js')

const BOT = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages
    ]
});

BOT.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    BOT.commands.set(command.data.name, command);
}

BOT.once(Events.ClientReady, () => {
  BOT.user.setPresence({
    status: 'online', // 'online' | 'idle' | 'dnd' | 'invisible'
    activities: [{ name: 'cursed quotes', type: ActivityType.Listening }]
  });
  console.log(`Ready! Logged in as ${BOT.user.tag}`);
});

BOT.login(process.env.TOKEN)
  .then(() => console.log('bot successfully logged in'))
  .catch(err => console.error('login error:', err));

BOT.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const command = BOT.commands.get(interaction.commandName);
    if (!command) return;

    try {
    await command.execute(interaction);
  } catch (error) {
    console.error(error);
    
    const fallback =
      responseMessages?.GENERIC_INTERACTION_ERROR
      || 'There was an error while executing this command.';
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: fallback, ephemeral: true });
      } else {
        await interaction.reply({ content: fallback, ephemeral: true });
      }
    } catch (e) {
      console.error('secondary error while reporting failure:', e);
    }
  }
});


process.on('unhandledRejection', (err) => console.error('unhandledRejection:', err));
process.on('uncaughtException', (err) => console.error('uncaughtException:', err));