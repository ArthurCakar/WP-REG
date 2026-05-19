const { startSignup } = require('../lib/signupManager');

module.exports = {
  name: 'testinformal',
  description: 'Post a test Informal signup in the current channel.',
  async execute(message) {
    await startSignup({
      channel: message.channel,
      type: 'Informal',
      mainSize: 10,
      subsSize: 5,
      durationMs: 2 * 60 * 1000,
      useRoleHierarchy: false,
      vcChannelId: '1451356360410398851',
    });
  },
};
