require('dotenv').config();
const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, ChannelType, PermissionsBitField, EmbedBuilder, StringSelectMenuBuilder, ActionRowBuilder } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildMessages, 
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ]
});

const commands = [
  new SlashCommandBuilder()
    .setName('bewerbung')
    .setDescription('Erstellt einen neuen privaten Channel zur Bewerbung.'),
  new SlashCommandBuilder()
    .setName('fragen')
    .setDescription('Verwalte die Bewerbungsfragen.')
    .addStringOption(option =>
      option.setName('action')
        .setDescription('Die Aktion, die du durchführen möchtest')
        .setRequired(true)
        .addChoices(
          { name: 'Hinzufügen', value: 'add' },
          { name: 'Entfernen', value: 'remove' },
          { name: 'Liste', value: 'list' }
        )
    )
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

let questions = []; // Fragen

client.once('ready', async () => {
  console.log(`Bot ist online als ${client.user.tag}`);

  try {
    console.log('Lade Befehle ...');
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands },
    );
    console.log('Befehle erfolgreich registriert.');
  } catch (error) {
    console.error('Fehler bei der Befehlsregistrierung:', error);
  }
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) return;

  const { commandName } = interaction;
  if (commandName === 'bewerbung') {
    const user = interaction.user;
    const guild = interaction.guild;

    try {
      const channel = await guild.channels.create({
        name: `bewerbung-${user.username}`,
        type: ChannelType.GuildText,
        permissionOverwrites: [
          {
            id: guild.id,
            deny: [PermissionsBitField.Flags.ViewChannel],
          },
          {
            id: user.id,
            allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
          },
          {
            id: client.user.id,
            allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
          },
        ],
      });

      await interaction.reply({ content: `Dein Bewerbungs-Channel wurde erstellt: ${channel}. Bitte beantworte die Fragen dort.`, ephemeral: true });

      const collectedAnswers = {};

      for (const question of questions) {
        await channel.send(question);
        const filter = response => response.author.id === user.id;
        const collected = await channel.awaitMessages({ filter, max: 1, time: 60000, errors: ['time'] })
          .catch(() => {
            channel.send('Die Zeit ist abgelaufen. Bitte starte die Bewerbung erneut mit /bewerbung.');
            setTimeout(() => channel.delete(), 10000);
            return null;
          });

        if (!collected) return;

        collectedAnswers[question] = collected.first().content;
      }

      await channel.send("Vielen Dank für deine Bewerbung! Hier sind deine Antworten:");

      for (const [question, answer] of Object.entries(collectedAnswers)) {
        await channel.send(`${question} ${answer}`);
      }

      const logChannel = guild.channels.cache.get('1276188434586796043');
      if (logChannel) {
        const fields = Object.entries(collectedAnswers).map(([question, answer]) => ({ name: question, value: answer }));

        const embed = new EmbedBuilder()
          .setColor(0xff0005)
          .setTitle(`Bewerbung von ${user.username}`)
          .setDescription(`Diese Bewerbung kommt von ${user.username}`)
          .addFields(fields)
          .setTimestamp()
          .setFooter({ text: `${user.username}`, iconURL: user.displayAvatarURL({ dynamic: true }) });

        await logChannel.send(`<@&1271500129379160116>`);
        await logChannel.send({ embeds: [embed] });
      }

      const countdownMessages = ["🚨3🚨", "🚨2🚨", "🚨1🚨"];
      for (let i = 0; i < countdownMessages.length; i++) {
        setTimeout(() => channel.send(countdownMessages[i]), 17000 + i * 1000);
      }

      setTimeout(() => channel.delete(), 20000);

    } catch (error) {
      console.error('Fehler beim Erstellen des Kanals:', error);
      try {
        await interaction.followUp({ content: 'Ein Fehler ist aufgetreten. Bitte versuche es später noch einmal.', ephemeral: true });
      } catch (followUpError) {
        console.error('Fehler beim Antworten auf die Interaktion:', followUpError);
      }
    }
  } else if (commandName === 'fragen') {
    const action = interaction.options.getString('action');

    if (action === 'add') {
      if (!interaction.member.roles.cache.has('1261052822133145733')) {
        await interaction.reply({ content: 'Du hast nicht die Berechtigung, Fragen hinzuzufügen.', ephemeral: true });
        return;
      }

      await interaction.reply({
        content: 'Gib die Frage ein, die du hinzufügen möchtest:',
        ephemeral: true
      });

      const filter = response => response.author.id === interaction.user.id;
      const collector = interaction.channel.createMessageCollector({ filter, max: 1, time: 60000 });

      collector.on('collect', async message => {
        questions.push(message.content);
        await interaction.followUp({ content: `Frage hinzugefügt: ${message.content}`, ephemeral: true });
      });

      collector.on('end', collected => {
        if (collected.size === 0) {
          interaction.followUp({ content: 'Die Zeit ist abgelaufen. Die Frage wurde nicht hinzugefügt.', ephemeral: true });
        }
      });

    } else if (action === 'remove') {
      if (!interaction.member.roles.cache.has('1261052822133145733')) {
        await interaction.reply({ content: 'Du hast nicht die Berechtigung, Fragen zu entfernen.', ephemeral: true });
        return;
      }

      const options = questions.map((question, index) => ({
        label: `Frage ${index + 1}`,
        value: `question_${index}`
      }));

      if (options.length === 0) {
        await interaction.reply({ content: 'Keine Fragen verfügbar zum Entfernen.', ephemeral: true });
        return;
      }

      const menu = new StringSelectMenuBuilder()
        .setCustomId('remove_question')
        .setPlaceholder('Wähle eine Frage zum Entfernen')
        .addOptions(options);

      const row = new ActionRowBuilder().addComponents(menu);
      await interaction.reply({ content: 'Wähle eine Frage aus, die du entfernen möchtest:', components: [row], ephemeral: true });

    } else if (action === 'list') {
      await interaction.reply({ content: `Aktuelle Fragen:\n${questions.join('\n')}`, ephemeral: true });
    }
  }
});

client.on('interactionCreate', async interaction => {
  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === 'remove_question') {
      if (!interaction.member.roles.cache.has('1261052822133145733')) {
        await interaction.reply({ content: 'Du hast nicht die Berechtigung, diese Aktion durchzuführen.', ephemeral: true });
        return;
      }

      const selectedQuestionIndex = parseInt(interaction.values[0].replace('question_', ''), 10);
      if (selectedQuestionIndex >= 0 && selectedQuestionIndex < questions.length) {
        const removedQuestion = questions.splice(selectedQuestionIndex, 1)[0];
        await interaction.reply({ content: `Frage entfernt: ${removedQuestion}`, ephemeral: true });
      } else {
        await interaction.reply({ content: 'Ungültige Frage ausgewählt.', ephemeral: true });
      }
    }
  }
});

client.login(process.env.TOKEN);
