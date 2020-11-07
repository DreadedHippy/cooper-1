import EMOJIS from '../../../bot/core/config/emojis.json';
import CHANNELS from '../../../bot/core/config/channels.json';
import ChannelsHelper from '../../../bot/core/entities/channels/channelsHelper';
import ServerHelper from '../../../bot/core/entities/server/serverHelper';
import UsersHelper from '../../../bot/core/entities/users/usersHelper';
import VotingHelper from '../../events/voting/votingHelper';
import STATE from '../../../bot/state';
import MessagesHelper from '../../../bot/core/entities/messages/messagesHelper';
import embedHelper from '../../../ui/embed/embedHelper';


export default class SacrificeHelper {
   
    static async onReaction(reaction, user) {
        const emoji = reaction.emoji.name;
        const isVoteEmoji = [EMOJIS.DAGGER, EMOJIS.SHIELD].indexOf(emoji) > -1;
        const channelID = reaction.message.channel.id;

        if (user.bot) return false;
        if (!isVoteEmoji) return false;
        if (channelID !== CHANNELS.SACRIFICE.id) return false;

        // Process the vote.
        this.processVote(reaction, user);
    }

    static async processVote(reaction, user) {
        const guild = ServerHelper.getByCode(STATE.CLIENT, 'PROD');

        // Try to access sacrificee from message
        try {
            const sacrificeEmbedDesc = reaction.message.embeds[0].description;
            const sacrificeeID = /<@(\d+)>/.exec(sacrificeEmbedDesc)[1];
            const targetMember = await UsersHelper.fetchMemberByID(guild, sacrificeeID);

            // If member left, don't do anything.
            if (!targetMember) return false;
            
            // Calculate the number of required votes for the redemption poll.
            const reqSacrificeVotes = VotingHelper.getNumRequired(guild, .025);
            const reqKeepVotes = VotingHelper.getNumRequired(guild, .02);
        
            // Get existing reactions on message.
            let sacrificeVotes = 0;
            let keepVotes = 0;
            reaction.message.reactions.cache.map(reactionType => {
                if (reactionType.emoji.name === EMOJIS.DAGGER) sacrificeVotes = Math.max(0, reactionType.count - 1);
                if (reactionType.emoji.name === EMOJIS.SHIELD) keepVotes = Math.max(0, reactionType.count - 1);
            });


            // Process votes with feedback for currently unprotected user.
            const rawKeepVotes = reqKeepVotes - keepVotes;
            if (rawKeepVotes > 0) {
                const remainingProtectVotes = Math.max(0, rawKeepVotes);
                const remainingSacrificeVotes = Math.max(0, reqSacrificeVotes - sacrificeVotes);   

                // Check if enough votes to sacrifice.
                if (remainingSacrificeVotes === 0) {
                    // Notify when user is voted out.
                    await ChannelsHelper._postToFeed(`<@${targetMember.id}>'s was sacrificed!`);

                    // TODO: await targetMember.ban();
                    await ChannelsHelper._postToFeed('User should be banned... (note)');

                } else {
                    // Provide feedback for user who is not currently protected or sacrificed.
                    await ChannelsHelper._postToFeed(
                        `<@${targetMember.id}>'s sacrifice was voted upon!` +
                        `\n\n**Remaining Votes:**` +
                        `\nTo Protect: ${EMOJIS.SHIELD}: ${remainingProtectVotes}` +
                        `\nTo Sacrifice: ${EMOJIS.DAGGER}: ${remainingSacrificeVotes}`
                    );
                }

                
            // Intercept latest vote granted protection to user.
            } else if (rawKeepVotes === 0 && reaction.emoji.name === EMOJIS.SHIELD) {
                await ChannelsHelper._postToFeed(`<@${targetMember.id}>'s was protected from sacrifice by votes!`);
            } 

        } catch(e) {
            console.error(e);
        }
    }

    static async offer(user) {
        // TODO: Check last sacrifice time

        // Add message to sacrifice
        const sacrificeEmbed = { embed: embedHelper({ 
            title: `${user.username}, you are being considered for sacrifice!`,
            description: `To sacrifice <@${user.id}> press dagger, to protect the user press the shield.`,
            thumbnail: UsersHelper.avatar(user)
        }) };
        const sacrificeMsg = await ChannelsHelper._postToChannelCode('SACRIFICE', sacrificeEmbed);
        const sacrificeLink = MessagesHelper.link(sacrificeMsg);

        // Post to feed
        setTimeout(() => {
            const sacrificeMsgText = `<@${user.id}> is being considered for sacrifice! Vote now! :O ` + sacrificeLink;
            ChannelsHelper._postToFeed(sacrificeMsgText);
        }, 1500);

        // Add reactions for voting
        setTimeout(async () => { await sacrificeMsg.react(EMOJIS.DAGGER); }, 1500);
        setTimeout(async () => { await sacrificeMsg.react(EMOJIS.SHIELD); }, 2000);

        return true;
    }
}