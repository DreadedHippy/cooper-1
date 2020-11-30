import ItemsHelper from '../../../community/features/items/itemsHelper';
import CoopCommand from '../../core/classes/coopCommand';
import MessagesHelper from '../../core/entities/messages/messagesHelper';
import ServerHelper from '../../core/entities/server/serverHelper';
import UsersHelper from '../../core/entities/users/usersHelper';
import STATE from '../../state';

export default class DropCommand extends CoopCommand {

	constructor(client) {
		super(client, {
			name: 'give',
			group: 'economy',
			memberName: 'give',
			aliases: ['g'],
			description: 'This command lets you give the items you own',
			details: `Details of the give command`,
			examples: ['give', '!give laxative'],
			args: [
				{
					key: 'itemCode',
					prompt: 'What is the code of the item you wish to give? Use !items if not sure',
					type: 'string',
					default: null
				},
				{
					key: 'target',
					prompt: 'Who do you wish to give the item to? @ them.',
					type: 'user',
					default: null
				},
			],
		});
	}

	async run(msg, { itemCode, target }) {
		super.run(msg);

		console.log(itemCode, target);

		// Check if this item code can be given.
		if (!ItemsHelper.isUsable(itemCode) || itemCode === null) 
			return MessagesHelper.selfDestruct(msg, 'Please provide a valid item name.', 10000);

		// Attempt to load target just to check it can be given.
		const guild = ServerHelper.getByCode(STATE.CLIENT, 'PROD');
		const targetUser = await UsersHelper.getUserByID(guild, target.id);
		if (!target || !targetUser)
			return MessagesHelper.selfDestruct(msg, `Gift target is invalid.`, 10000);

		// Check if this user owns that item.
		const itemQty = await ItemsHelper.getUserItemQty(msg.author.id, itemCode);
		if (itemQty <= 0) 
			return MessagesHelper.selfDestruct(msg, `You do not own enough ${itemCode}.`, 10000);

		// Attempt to use item and only grant once returned successful, avoid double gift glitching.
		if (await ItemsHelper.use(target.id, itemCode, 1)) {

		}
		console.log(itemCode);

		// Check user owns it, nvm... let ItemsHelper do that.
		// ItemsHelper.dropItem(msg.author.id, itemCode);
    }
    
};