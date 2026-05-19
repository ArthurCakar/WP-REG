const { startSignup } = require('../lib/signupManager');

module.exports = {
  name: 'testsignup',
  description: 'Post a test signup immediately in the current channel.',
  async execute(message, args) {
    const type = args[0] || 'Informal';
    const mainSize = parseInt(args[1], 10) || 10;
    const subsSize = parseInt(args[2], 10) || 5;
    const durationMinutes = parseInt(args[3], 10) || 2;

    const vcChannelId = type === 'Informal' ? '1451356360410398851' : '1451338447913750704';

    await startSignup({
      channel: message.channel,
      type,
      mainSize,
      subsSize,
      durationMs: durationMinutes * 60 * 1000,
      vcChannelId,
    });
  },
};
