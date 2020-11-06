import embedHelper from '../../../ui/embed/embedHelper';
import CoopCommand from '../../core/classes/coopCommand';
import EMOJIS from '../../core/config/emojis.json';
import ChannelsHelper from '../../core/entities/channels/channelsHelper';
import MessagesHelper from '../../core/entities/messages/messagesHelper';
import UsersHelper from '../../core/entities/users/usersHelper';

export default class SacrificeCommand extends CoopCommand {

	constructor(client) {
		super(client, {
			name: 'sacrifice',
			group: 'community',
			memberName: 'sacrifice',
			aliases: [],
			description: 'The command for starting a round of sacrifices.',
			details: `Details of the points command`,
			examples: ['points', 'an example of how coop-econmics functions, trickle down, sunny side up Egg & Reagonmics. Supply and demand.'],
		});
	}

	async run(msg) {
		super.run(msg);

		try {
			// Get sacrifice target
			let targetUser;
			if (msg.mentions.users.first()) targetUser = msg.mentions.users.first();
			if (!targetUser) throw new Error('Sacrifice target required.');

			// Add message to sacrifice
			const sacrificeEmbed = { embed: embedHelper({ 
				title: `${targetUser.username}, you are being considered for sacrifice!`,
				description: `To vote for ${targetUser.username} use the emojis on their intro post.`,
				thumbnail: UsersHelper.avatar(targetUser.user)
			}) };
			const sacrificeMsg = await ChannelsHelper._postToChannelCode('SACRIFICE', sacrificeEmbed);
			const sacrificeLink = MessagesHelper.link(sacrificeMsg);

			// Post to feed
			setTimeout(() => {
				ChannelsHelper._postToFeed(
					`${targetUser.username} is being considered for sacrifice! Vote now! :O `
					+ sacrificeLink
				);
			}, 1500);

			// Add reactions for voting
			await sacrificeMsg.react(EMOJIS.VOTE_AGAINST);

		} catch(e) {
			console.error(e);

			// Create error message.
			const errorMsg = await msg.say(e.message);

			// Delete error message when no longer necessary.
			if (errorMsg) setTimeout(() => {
				errorMsg.delete();
			}, 3000);
		}
    }
    
};