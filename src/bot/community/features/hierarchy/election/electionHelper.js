import moment from 'moment';

import ChannelsHelper from "../../../../core/entities/channels/channelsHelper";
import MessagesHelper from '../../../../core/entities/messages/messagesHelper';
import ServerHelper from '../../../../core/entities/server/serverHelper';
import UsersHelper from '../../../../core/entities/users/usersHelper';
import Database from '../../../../core/setup/database';
import Chicken from "../../../chicken";
import TimeHelper from '../../server/timeHelper';

import CHANNELS from '../../../../core/config/channels.json';
import STATE from '../../../../state';
import DatabaseHelper from '../../../../core/entities/databaseHelper';
import VotingHelper from '../../../events/voting/votingHelper';

// MVP: Elections
// Election Start -> Stand -> Consider -> Vote -> Election Declared

// TODO:
// Preload candidates messages. [DONE]
// Create previous commanders table [DONE]
// Tell the community once a day when the next election is [DONE]

// Detect the start of an election.

// Should be posted/maintain an election message in about channel?

// Detect a vote
// Count votes and announce until election over

// Declare election over
// Assign roles
// Announce win

// Inspect candidate campaign
// Stand for election

// Create election results table


// Vote _once_ for candidate.
// Inspect candidates list
// Last election attribute
// Election over unix timestamp
// latest winner
// Previous winner
// hasMostVotes
// potentialLeaders

// track voting like US election


export default class ElectionHelper {

    static INTERVAL_SECS = 3600 * 24 * 25;
    static DURATION_SECS = 3600 * 24 * 7;

    static async addVote(userID, candidateID) {
        const query = {
            name: "add-vote",
            text: `INSERT INTO election_votes(candidate_id, voter_id, time)
                VALUES($1, $2, $3)`,
            values: [userID, candidateID, (parseInt(Date.now() / 1000))]
        };
        
        const result = await Database.query(query);
        return result;
    }

    static async clearElection() {
        // vv same as below but for votes.
        await this.clearVotes();
        await this.clearCandidates();
    }

    static async clearVotes() {
        const query = {
            name: "delete-votes",
            text: `DELETE FROM election_votes`
        };
        
        const result = await Database.query(query);
        return result;
    }

    static async clearCandidates() {
        const candidates = await this.getAllCandidates();
        
        // Bulk delete may be better here.
        // Ensure all messages deleted, use bulk delete won't be outside of 14 days
        candidates.map((candidate, index) => {
            setTimeout(() => {
                MessagesHelper.deleteByLink(candidate.campaign_msg_link);
            }, 1500 * index);
        });

        // Clear database
        const query = {
            name: "delete-candidates",
            text: `DELETE FROM candidates`
        };
        const result = await Database.query(query);
        return result;
    }

    

    static async votingPeriodLeftSecs() {
        let leftSecs = 0;

        const isVotingPeriod = await this.isVotingPeriod();
        if (isVotingPeriod) {
            const endOfVoting = (await this.lastElecSecs()) + this.DURATION_SECS;
            const diff = Math.abs(endOfVoting - parseInt(Date.now() / 1000))
            
            if (diff) leftSecs = diff;
        }

        return leftSecs;
    }

    static async isVotingPeriod() {
        const nowSecs = parseInt(Date.now() / 1000);
        const electionSecs = await this.lastElecSecs();
        const isVotingPeriod = !!(nowSecs >= electionSecs && nowSecs <= electionSecs + this.DURATION_SECS);
        return isVotingPeriod;
    }

    static async startElection() {
        try {
            ChannelsHelper._postToFeed('Starting the election...');
    
            // Turn election on and set latest election to now! :D
            await Chicken.setConfig('election_on', 'true');
            await Chicken.setConfig('last_election', parseInt(Date.now() / 1000));
    
            // Update the election message
            const readableElecLeft = TimeHelper.humaniseSecs((await this.votingPeriodLeftSecs()));
            const startElecText = `The election is currently ongoing! Time remaining: ${readableElecLeft}`;
            await this.editElectionInfoMsg(startElecText);

        } catch(e) {
            console.log('Starting the election failed... :\'(');
            console.error(e);
        }

    }

    // Provide updates and functionality for an ongoing election.
    static async commentateElectionProgress() {
        const votes = await this.fetchAllVotes();

        const readableElecLeft = TimeHelper.humaniseSecs((await this.votingPeriodLeftSecs()));
        const commentatingText = `<#${CHANNELS.ELECTION.id}> is running and has ${readableElecLeft} remaining!`;
        await ChannelsHelper._postToFeed(commentatingText);

        const hierarchy = this.calcHierarchy(votes);
        const electionProgressText = `Election is still running for (TIME_REMAINING?), here is current information:` +
            `\n\n` +
            `Commander: ${hierarchy.commander.username} (${hierarchy.commander.votes} Votes)` +
            `\n\n` +
            `Leaders: \n ${hierarchy.leaders.map(leader => `${leader.username} (${leader.votes} Votes) \n`)}` +
            `\n\n` +

        await this.editElectionInfoMsg(electionProgressText)

        // Note: Votes aren't saved in the database... we rely solely on Discord counts.
    }

    static async endElection() {
        try {
            const votes = await this.fetchAllVotes();
            
            console.log('Ending the election!', votes);
            
            // Get winners hierarchy
            // Slatxyo could convert that to an embed hopefully.
            ChannelsHelper._postToFeed('Ending the election...');

            // Cleanup database records fresh for next run.
            await this.clearElection();

            // Set Cooper's config election_on to 'false' so he does not think election is ongoing.
            await Chicken.setConfig('election_on', 'false');

            // Set the election info message to next election data, previous winners.
            await this.editElectionInfoMsg('Election ended... next will be?');

        } catch(e) {
            console.log('Something went wrong ending the election...');
            console.error(e);
        }
    }

    static async checkProgress() {
        let electionStarted = false;
        try {
            const isVotingPeriod = await this.isVotingPeriod();
            const isElecOn = await this.isElectionOn();

            // TODO: May need to clean up any non-info/candidates messages leftover.

            // Election needs to be started?
            if (isVotingPeriod && !isElecOn) {
                await this.startElection();
                electionStarted = true;
            }
    
            // Election needs to be declared?
            if (!isVotingPeriod && isElecOn) await this.endElection();
    
            // Election needs to announce update?
            if (isVotingPeriod && isElecOn) await this.commentateElectionProgress();

            // If election isn't running (sometimes) update about next election secs.
            if (!isElecOn && !electionStarted) {
                const elecMsg = await this.getElectionMsg();
                const diff = parseInt(Date.now()) - elecMsg.editedTimestamp;
                const hour = 360000;
                if (diff > hour * 8) {
                    const diff = await this.nextElecSecs() - parseInt(Date.now() / 1000)
                    const humanRemaining = moment.duration(diff).humanize();
                    const nextElecReadable = await this.nextElecFmt();
                    await this.editElectionInfoMsg(`**Election is over.**

                        Your current elected members:

                        Next Election: ${nextElecReadable} (${humanRemaining})`);
                }
            }

        } catch(e) {
            console.log('SOMETHING WENT WRONG WITH CHECKING ELECTION!');
            console.error(e);
        }
    }

    static async getElectionMsg() {
        const electionInfoMsgLink = await Chicken.getConfigVal('election_message_link');
        const msgData = MessagesHelper.parselink(electionInfoMsgLink);   
        const channel = ChannelsHelper._get(msgData.channel);
        const msg = await channel.messages.fetch(msgData.message);
        return msg;
    }

    static async editElectionInfoMsg(text) {
        const msg = await this.getElectionMsg();
        const editedMsg = await msg.edit(text);
        return editedMsg;
    }

    static async getVoteByVoterID(voterID) {
        let voter = null;
        const query = {
            name: "get-voter",
            text: `SELECT * FROM election_votes WHERE voter_id = $1`,
            values: [voterID]
        };
        
        const result = await Database.query(query);

        if (result.rows) voter = result.rows[0];

        return voter;
    }

    // Check if this reaction applies to elections.
    static async onReaction(reaction, user) {
        // Check if occurred in election channel
        if (reaction.message.channel.id !== CHANNELS.ELECTION.id) return false;

        // Ignore Cooper's prompt emoji.
        if (UsersHelper.isCooper(user.id)) return false;

        // Check if reaction is crown (indicates vote)
        if (reaction.emoji.name !== '👑') return false;

        try {
            // Check if reaction message is a campaign message and get author.
            const msgLink = MessagesHelper.link(reaction.message);
            const candidate = await this.getCandByMsgLink(msgLink); 

            // If is candidate message and identified, allow them the vote.
            if (candidate) {
                // Check if already voted
                const vote = await this.getVoteByVoterID(user.id);
                const candidateUser = (await UsersHelper._getMemberByID(candidate.candidate_id)).user;
                
                if (vote) {
                    // self destruct message stating you've already voted.
                    const prevVoteForCandidate = await UsersHelper._getMemberByID(vote.candidate_id);
                    const prevVoteFor = prevVoteForCandidate.user.username || '?';
                    const warnText = `You already voted for ${prevVoteFor}, you cheeky fluck.`;

                    // Delay unreact... make sure their reaction isn't counted anyway.
                    const userReactions = reaction.message.reactions.cache
                        .filter(reaction => reaction.users.cache.has(user.id));

                    console.log('userReactions', userReactions);

                    for (const userReact of userReactions.values()) 
                        await userReact.users.remove(user.id);

                    return MessagesHelper.selfDestruct(reaction.message, warnText);
                }

                if (!vote) {
                    // Add vote to database
                    await this.addVote(user.id, candidate.candidate_id);

                    // Need to load candidate via cache id, no access YET.
                    console.log('voted for candidate id ' + candidate.candidate_id);
        
                    // Acknowledge vote in feed.
                    ChannelsHelper._postToFeed(`${user.username} cast their vote for ${candidateUser.username}!`);
                }
            }
        } catch(e) {
            console.log('Could not process election vote.');
            console.error(e);
        }
    }

    static async countVotes() {
        const query = {
            name: "get-candidate",
            text: `SELECT candidateID, COUNT(*) FROM votes GROUP BY candidateID`,
            values: [userID]
        };

        const result = await Database.query(query);
        return result;
    }

    static calcHierarchy(votes) {
        const commander = votes[0];
        const numLeaders = VotingHelper.getNumRequired(ServerHelper._coop(), 2.5);
        const leaders = votes.slice(1, numLeaders);

        const hierarchy = { commander, leaders}

        return hierarchy;
    }

    static async loadAllCampaigns() {
        const candidates = await this.getAllCandidates();
        const preloadMsgIDs = candidates.map(candidate => 
            MessagesHelper.parselink(candidate.campaign_msg_link)
        );

        // Preload each candidate message.
        const campaigns = await Promise.all(preloadMsgIDs.map((idSet, index) => {
            const guild = ServerHelper._coop();
            return new Promise((resolve, reject) => {
                setTimeout(async () => {
                    const chan = guild.channels.cache.get(idSet.channel);
                    if (chan) {
                        const msg = await chan.messages.fetch(idSet.message);
                        resolve(msg);
                    }

                    resolve(null);
                }, 666 * index);
            });
        }));
        return campaigns;
    }

    static async getCandByMsgLink(msgLink) {
        const query = {
            name: "get-candidate-by-msg",
            text: `SELECT * FROM candidates WHERE campaign_msg_link = $1`,
            values: [msgLink]
        };

        let candidate = null;
        const result = await Database.query(query);

        if (result.rows) candidate = result.rows[0];

        return candidate;
    }

    // TODO: could use this feature/data to direct message the candidates an update
    static async fetchAllVotes() {
        const votes = [];

        // Calculate votes and map author data.
        const campaignMsgs = await this.loadAllCampaigns();
        campaignMsgs.map(campaignMsg => {
            // Find the candidate for these reactions.
            const candidate = campaignMsg.mentions.users.first();

            // Add to the overall data.
            if (candidate) {
                votes.push({
                    username: candidate.username,
                    id: candidate.id,
                    votes: campaignMsg.reactions.cache.reduce((acc, reaction) => {
                        // Count all crown reactions.
                        if (reaction.emoji.name === '👑') return acc += (reaction.count - 1);
                        else return 0;
                    }, 0)
                });
            }
        });
   
        votes.sort((a, b) => {
            if (a.votes < b.votes) return 1;
            if (a.votes > b.votes) return -1;
            return 0;
        });

        return votes;
    }

    static async getCandidate(userID) {
        const query = {
            name: "get-candidate",
            text: `SELECT * FROM candidates WHERE candidate_id = $1`,
            values: [userID]
        };
        
        const result = await Database.query(query);
        const candidate = DatabaseHelper.single(result);

        return candidate;
    }


    // Preload campaign messages into cache so they are always reactable.
    static async onLoad() {
        const isElectionOn = await this.isVotingPeriod();

        console.log(isElectionOn);

        if (isElectionOn) {
            await this.loadAllCampaigns();
            console.warn('Cached election candidates.');
        }

    }

    static async addCandidate(userID, msgLink) {
        const query = {
            name: "add-candidate",
            text: `INSERT INTO candidates(campaign_msg_link, candidate_id)
                VALUES($1, $2)`,
            values: [msgLink, userID]
        };
        
        const result = await Database.query(query);
        return result;
    }

    static async getAllCandidates() {
        const query = {
            name: "get-all-candidates",
            text: `SELECT * FROM candidates`
        };
        
        let candidates = null;
        const result = await Database.query(query);
        if (result.rows) candidates = result.rows;

        return candidates;
    }

    static async shouldTriggerStart() {
        console.log('shouldTriggerStart');
        const isVotingPeriod = await this.isVotingPeriod();
        const isElecOn = await this.isElectionOn();

        if (isVotingPeriod && !isElecOn) this.checkProgress();
    }


    static async lastElecSecs() {
        const lastElecSecsVal = await Chicken.getConfigVal('last_election');
        const lastElecSecs = parseInt(lastElecSecsVal);
        return lastElecSecs;        
    }

    static async lastElecFmt() {
        const lastElecSecs = await this.lastElecSecs();
        const lastElecMoment = moment.unix(lastElecSecs);
        return lastElecMoment.format('dddd, MMMM Do YYYY, h:mm:ss a');
    }

    static async nextElecFmt() {
        const nextElecSecs = await this.nextElecSecs();
        const nextElecMoment = moment.unix(nextElecSecs);
        return nextElecMoment.format('dddd, MMMM Do YYYY, h:mm:ss a');
    }

    static async nextElecSecs() {
        const lastElecSecs = await this.lastElecSecs();
        const nextElecSecs = lastElecSecs + this.INTERVAL_SECS;
        return nextElecSecs;
    }

    // This is only active from next election interval moment to a week after that
    static async isElectionOn() {
        const electionOnVal = await Chicken.getConfigVal('election_on');
        return electionOnVal === 'true';
    }

    static async isElectionTime() {
        const lastElecSecs = await this.lastElecSecs();
        const nextElecSecs = await this.nextElecSecs();
        const nextDeclareSecs = lastElecSecs + this.INTERVAL_SECS + this.DURATION_SECS;

        const nowSecs = parseInt(Date.now() / 1000);

        if (nowSecs >= nextElecSecs && nowSecs <= nextDeclareSecs) return true;

        return false;
    }

}