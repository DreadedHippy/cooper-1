import ChannelsHelper from "../../../../core/entities/channels/channelsHelper";
import STATE from "../../../../state";
import PointsHelper from "../../points/pointsHelper";
import ItemsHelper from "../itemsHelper";
import { EGG_DATA } from '../../minigame/small/egghunt';
import MessagesHelper from "../../../../core/entities/messages/messagesHelper";

// TODO: Make into "ReactionUsableItem" and add callback

export default class LegendaryEggHandler {

    static async onReaction(reaction, user) {
        if (reaction.emoji.name === 'legendary_egg') {
            try {
                const didUse = await ItemsHelper.use(user.id, 'LEGENDARY_EGG', 1);
                if (!didUse) {
                    const failureText = `${user.username} tried to use a legendary egg, but has none l-`;
                    MessagesHelper.selfDestruct(reaction.message, failureText)
                    MessagesHelper.delayReactionRemoveUser(reaction, user.id, 333);

                } else {
                    const backFired = STATE.CHANCE.bool({ likelihood: 25 });
                    const author = reaction.message.author;
                    const targetID = backFired ? user.id : author.id;

                    // Toxic bomb damage definition.
                    const damage = EGG_DATA['LEGENDARY_EGG'].points;

                    // Apply the damage to the target's points.
                    const updatedPoints = await PointsHelper.addPointsByID(targetID, damage);

                    // Add visuals animation
                    MessagesHelper.delayReactionRemove(reaction, 333);
                    MessagesHelper.delayReact(reaction.message, '💜', 666);

                    const damageInfoText = ` ${damage} points (${updatedPoints})`;
                    let actionInfoText = `${user.username} used a legendary egg on ${author.username}`;
                    if (backFired) actionInfoText = `**${user.username} tried to use a legendary egg on ${author.username}, but it backfired.**`;

                    const feedbackMsgText = `${actionInfoText}: ${damageInfoText}.`;
                    ChannelsHelper.codeShoutReact(reaction.message, feedbackMsgText, 'ACTIONS', '💜');
                    ChannelsHelper._postToChannelCode('FEED', feedbackMsgText, 666);
                }
            } catch(e) {
                console.error(e);
            }
        }   
    }
   
}