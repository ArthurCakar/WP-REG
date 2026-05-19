const { 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  EmbedBuilder, 
  ModalBuilder, 
  TextInputBuilder, 
  TextInputStyle 
} = require('discord.js');

function parseTargetId(input) {
  if (!input) return null;
  const match = input.match(/\d{17,20}/);
  return match ? match[0] : null;
}

function getPriorityInfo(member, top5RoleId, top10RoleId, useRoleHierarchy = false) {
  if (!member) return { level: -1, emoji: '', name: 'Unknown' };
  
  if (useRoleHierarchy) {
    let maxPosition = -1;
    member.roles.cache.forEach(role => {
      if (role.name !== '@everyone' && role.position > maxPosition) {
        maxPosition = role.position;
      }
    });
    const emoji = maxPosition >= 0 ? '👑' : '⚔️';
    return { level: maxPosition, emoji, name: maxPosition >= 0 ? 'High Priority' : 'Normal' };
  }
  
  if (top5RoleId && member.roles.cache.has(top5RoleId)) {
    return { level: 2, emoji: '👑', name: 'Top 5' };
  }
  if (top10RoleId && member.roles.cache.has(top10RoleId)) {
    return { level: 1, emoji: '🎖️', name: 'Top 10' };
  }
  return { level: 0, emoji: '⚔️', name: 'Normal' };
}

function getPriority(member, top5RoleId, top10RoleId, useRoleHierarchy = false) {
  return getPriorityInfo(member, top5RoleId, top10RoleId, useRoleHierarchy).level;
}

async function makeEmbed(title, main, subs, mainSize, guild, top5RoleId, top10RoleId, useRoleHierarchy, vcChannelId) {
  // Build roster display with priority emojis and VC status
  const buildRosterText = (roster) => {
    return roster.map((m, i) => {
      const member = guild.members.cache.get(m.id);
      const priorityInfo = getPriorityInfo(member, top5RoleId, top10RoleId, useRoleHierarchy);
      
      let vcStatus = '❌';
      if (vcChannelId && member && member.voice && member.voice.channelId === vcChannelId) {
        vcStatus = '✅';
      }
      
      return `${priorityInfo.emoji} <@${m.id}> ${vcStatus}`;
    }).join('\n');
  };
  
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor('#2f3136')
    .setDescription('Use the buttons below to join, leave, or pass your spot.')
    .addFields(
      { name: 'Participant Count', value: `${main.length}/${mainSize}`, inline: true },
      { name: 'Main Roster', value: main.length ? buildRosterText(main) : 'Empty', inline: false },
      { name: 'Subs Roster', value: subs.length ? buildRosterText(subs) : 'Empty', inline: false }
    )
    .setFooter({ text: 'Signup is open' });
  return embed;
}


function findLowestIndex(main, guild, top5RoleId, top10RoleId, useRoleHierarchy = false) {
  let lowestPriority = Infinity;
  let chosenIndex = -1;
  for (let i = main.length - 1; i >= 0; i--) {
    const m = main[i];
    const mem = guild.members.cache.get(m.id) || null;
    const p = getPriority(mem, top5RoleId, top10RoleId, useRoleHierarchy);
    if (p < lowestPriority) {
      lowestPriority = p;
      chosenIndex = i;
    }
  }
  return chosenIndex;
}

function shuffleArray(items) {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function buildSignupRow({ disabled = false } = {}) {
  const buttons = shuffleArray([
    new ButtonBuilder().setCustomId('participate').setLabel('Participate').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('leave').setLabel('Leave').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('giveplace').setLabel('Give Place').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('decoy').setLabel('Check').setStyle(ButtonStyle.Secondary)
  ]).map(button => disabled ? button.setDisabled(true) : button);

  return new ActionRowBuilder().addComponents(buttons);
}

async function startSignup(options) {
  
  const channel = options.channel;
  const type = options.type || 'Informal';
  const mainSize = options.mainSize || 10;
  const subsSize = options.subsSize || 5;
  const parsedDurationMs = Number(options.durationMs);
  const durationMs = Number.isFinite(parsedDurationMs) && parsedDurationMs > 0 ? parsedDurationMs : 10 * 60 * 1000;
  const top5RoleId = options.top5RoleId || null;
  const top10RoleId = options.top10RoleId || null;
  const useRoleHierarchy = options.useRoleHierarchy || false;
  const vcChannelId = options.vcChannelId || null;
  const rolePingId = options.rolePingId || null;

  const main = [];
  const subs = [];
  const guild = channel.guild;
  const signupEndsAt = Date.now() + durationMs;

  const row = buildSignupRow();

  const embed = await makeEmbed(`${type} Signup`, main, subs, mainSize, guild, top5RoleId, top10RoleId, useRoleHierarchy, vcChannelId);
  let signupMsg;
  try {
    signupMsg = await channel.send({ embeds: [embed], components: [row] });
  } catch (err) {
    console.error('Failed to send signup message:', err);
    return null;
  }

  if (rolePingId) {
    try {
      await channel.send({ content: `<@&${rolePingId}>` });
    } catch (err) {
      console.error('Failed to send signup role mention:', err);
    }
  }

  const collector = signupMsg.createMessageComponentCollector();
  let rosterMutationQueue = Promise.resolve();
  const enqueueRosterMutation = (task) => {
    rosterMutationQueue = rosterMutationQueue
      .then(task)
      .catch(err => {
        console.error('Failed to process roster mutation', err);
      });
    return rosterMutationQueue;
  };

  const closeTimer = setTimeout(() => {
    if (!collector.ended) {
      collector.stop('duration');
    }
  }, durationMs);

  collector.on('collect', async interaction => {
    const uid = interaction.user.id;
    if (interaction.customId === 'participate') {
      await interaction.deferUpdate();
      await enqueueRosterMutation(async () => {
        const inMainIdx = main.findIndex(m => m.id === uid);
        const inSubsIdx = subs.findIndex(m => m.id === uid);

        if (inMainIdx !== -1 || inSubsIdx !== -1) return;

        const targetEntry = { id: uid };

        if (main.length < mainSize) {
          main.push(targetEntry);
        } else if (subs.length < subsSize) {
          subs.push(targetEntry);
        }
      });
    } else if (interaction.customId === 'leave') {
      await interaction.deferUpdate();
      await enqueueRosterMutation(async () => {
        const inMainIdx = main.findIndex(m => m.id === uid);
        const inSubsIdx = subs.findIndex(m => m.id === uid);

        if (inMainIdx !== -1) {
          main.splice(inMainIdx, 1);
          if (subs.length) main.push(subs.shift());
        } else if (inSubsIdx !== -1) {
          subs.splice(inSubsIdx, 1);
        }
      });
    } else if (interaction.customId === 'decoy') {
      await interaction.reply({ content: 'This button does nothing.', ephemeral: true });
    } else if (interaction.customId === 'giveplace') {
      const inMainIdx = main.findIndex(m => m.id === uid);
      const inSubsIdx = subs.findIndex(m => m.id === uid);

      if (inMainIdx === -1 && inSubsIdx === -1) {
        await interaction.reply({ content: 'You need to be on the roster first to give your place.', ephemeral: true });
        return;
      }

      const modalId = `giveplace:${signupMsg.id}:${uid}`;
      const modal = new ModalBuilder()
        .setCustomId(modalId)
        .setTitle('Give Place');

      const input = new TextInputBuilder()
        .setCustomId('targetUser')
        .setLabel('User ID or mention')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('123456789012345678 or <@123456789012345678>')
        .setRequired(true);

      const modalRow = new ActionRowBuilder().addComponents(input);
      modal.addComponents(modalRow);

      await interaction.showModal(modal);

      try {
        const submitted = await interaction.awaitModalSubmit({
          filter: i => i.user.id === uid && i.customId === modalId,
          time: 30000,
        });
        const targetId = parseTargetId(submitted.fields.getTextInputValue('targetUser'));

        if (!targetId) {
          await submitted.reply({ content: 'Could not read that user. Use a mention or a user ID.', ephemeral: true });
          return;
        }

        const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);
        if (!targetMember) {
          await submitted.reply({ content: 'That user is not in this server.', ephemeral: true });
          return;
        }

        const targetInMainIdx = main.findIndex(m => m.id === targetId);
        const targetInSubsIdx = subs.findIndex(m => m.id === targetId);

        if (targetId === uid) {
          await submitted.reply({ content: 'You cannot give your spot to yourself.', ephemeral: true });
          return;
        }

        if (targetInMainIdx !== -1 || targetInSubsIdx !== -1) {
          await submitted.reply({ content: 'That user is already on the roster.', ephemeral: true });
          return;
        }

        const targetEntry = { id: targetId };

        if (inMainIdx !== -1) {
          main[inMainIdx] = targetEntry;
        } else if (inSubsIdx !== -1) {
          subs[inSubsIdx] = targetEntry;
        }

        await submitted.reply({ content: 'Spot updated.', ephemeral: true });
      } catch (err) {
        console.error('Give Place modal timed out or failed', err);
      }
    }

    // update embed
    try {
      const newEmbed = await makeEmbed(`${type} Signup`, main, subs, mainSize, guild, top5RoleId, top10RoleId, useRoleHierarchy, vcChannelId);
      await signupMsg.edit({ embeds: [newEmbed], components: [buildSignupRow()] });
    } catch (err) {
      console.error('Failed to edit signup message', err);
    }
  });

  collector.on('end', async () => {
    clearTimeout(closeTimer);
   
    const disabledRow = buildSignupRow({ disabled: true });
    try {
      const finalEmbed = await makeEmbed(`${type} Signup — Closed`, main, subs, mainSize, guild, top5RoleId, top10RoleId, useRoleHierarchy, vcChannelId);
      await signupMsg.edit({ embeds: [finalEmbed], components: [disabledRow] });
    } catch (err) {
      console.error('Failed to finalize signup message', err);
    }
  });

  return { message: signupMsg, collector, main, subs };
}

module.exports = { startSignup };