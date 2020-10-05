import Chance from 'chance';

import SERVERS from '../../../../bot/core/config/servers.json';
import state from '../../../../bot/state';


const likelihood = 2.5;
// const likelihood = 75;

export default class EggHuntMinigame {
    
    static async run() {
        try {
            const rand = new Chance;
            if (rand.bool({ likelihood })) {
                const server = state.CLIENT.guilds.cache.find(guild => guild.id === SERVERS.PROD.id);
                const channelCount = server.channels.cache.size;
    
                const textChannels = server.channels.cache.filter(channel => channel.type === 'text');
    
                const channelIDs = Array.from(textChannels.keys());
                const randomChannelIndex = rand.natural({ min: 0, max: channelCount - 1 });
                const randomChannelID = channelIDs[randomChannelIndex];
    
                const dropChannel = textChannels.get(randomChannelID);
                if (dropChannel) {
                    // TODO: Implement egg rarities
                    const eggMsg = await dropChannel.send('🥚');
                    // eggMsg.react('🧺');

                    const feedChannel = textChannels.get(CHANNELS.FEED.id);
                    feedChannel.send('Whoops! I dropped an egg, but where..?');
                }
            }

        } catch(e) {
            console.error(e);
        }

        // TODO: Doubletap, random chance of spawning another egg shortly after
        // if (rand.bool({ likelihood })) {

        // TODO: Tripletap, random chance of spawning another egg fair bit later (break up 30 mins wait)
    }
}