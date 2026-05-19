const { startSignup } = require('../lib/signupManager');
require('dotenv').config({ override: true });

module.exports = {
  name: 'testfoundry',
  description: 'Post a test Foundry signup in the current channel.',
  async execute(message) {
    await startSignup({
      channel: message.channel,
      type: 'Foundry',
      mainSize: 25,
      subsSize: 10,
      durationMs: 2 * 60 * 1000,
      top5RoleId: process.env.TOP5_ROLE_ID || null,
      top10RoleId: process.env.TOP10_ROLE_ID || null,
      useRoleHierarchy: false,
      vcChannelId: '1451338447913750704',
    });
  },
};
