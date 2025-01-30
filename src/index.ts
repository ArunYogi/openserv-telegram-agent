import 'dotenv/config'
import { z } from 'zod'
import { Agent } from '@openserv-labs/sdk'
import TelegramBot from 'node-telegram-bot-api'
import { readFileSync, writeFile, existsSync, writeFileSync } from 'node:fs';
import { isNotBlank } from './utils'

if (!process.env.TELEGRAM_BOT_TOKEN) {
  throw new Error('TELEGRAM_BOT_TOKEN is not set')
}

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true })
const agent = new Agent({
  systemPrompt: 'You are an AI agent responsible for managing and facilitating seamless integration with Telegram. Your tasks include handling messages, responding to user queries, managing group interactions, and ensuring smooth communication. Always provide accurate and helpful responses while maintaining a friendly and professional tone.',
})

let monitoredGroups: { id: number, title?: string, workspaceid?: string, agentid?: string }[] = [];
const fileName = 'monitoredGroups.json';
if (!existsSync(fileName)) {
  writeFileSync(fileName, '[]');
}
const _v = readFileSync(fileName, 'utf-8');
if (isNotBlank(_v)) {
  monitoredGroups = JSON.parse(_v);
}

function getChat(groupName: string) {
  return monitoredGroups.find(g => g.title == groupName)
}
// Add capability to send message to group
agent.addCapability({
  name: 'sendMessage',
  description: 'Sends a message to a Telegram group',
  schema: z.object({
    groupName: z.string().optional().describe('Telegram Group name to which message needs to be sent'),
    chatid: z.number().optional().describe('Telegram Chat id to which message needs to be sent'),
    message: z.string().describe('Message to be sent to the group'),
  }),
  async run({ args, action }) {
    try {
      console.log('sendMessage', args, action)
      if (args.chatid) {
        await bot.sendMessage(args.chatid, args.message)
        return `Message sent successfully to ${args.chatid}`
      }
      if (args.groupName) {
        const chats = await getChat(args.groupName)
        await bot.sendMessage(chats!.id, args.message)
        return `Message sent successfully to ${args.groupName}`
      }
      return 'We need Telegram Chat id or Group name to send message';
    } catch (error) {
      console.error(error);
      return `Currently we are facing error while sending message to ${args.groupName}`
    }
  }
})

// Add capability to send files like image,audio, video and document to Group
agent.addCapability({
  name: 'send_Image_Video_Audio_Document_telegram',
  description: 'Send Image/Video/Audio/Document to Telegram Group',
  schema: z.object({
    groupName: z.string().optional(),
    chatid: z.number().optional(),
    fileUrl: z.string().optional().describe('URL of the file to be sent'), // either fileurl or file needs to be sent
    file: z.instanceof(Buffer).optional().describe('Buffer of the file to be sent'),
    filetype: z.string().optional().describe('Type of file to be sent, like image, video, audio, document'),// this field is useable only when file is sent
    message: z.string(),
  }),
  async run({ args, action }) {
    console.log('send_Image_Video_Audio_Document_telegram', args, action)
    if (args.chatid) {
      return await sendMessage(args.chatid, args)
    }
    if (args.groupName) {
      const chats = await getChat(args.groupName)
      // await bot.sendPhoto(chats.id, args.imageUrl)
      return await sendMessage(chats!.id, args)
    }
    return "We need Telegram Chat id or Group name to send message";
  }
})

// Add capability to send files like image,audio, video and document to Group
agent.addCapability({
  name: 'forwardMessage',
  description: 'Forward messages from one telegram group to another group based on groupid or name',
  schema: z.object({
    groupName: z.string().optional(),
    chatid: z.number().optional(),
    fromChatId: z.number(),
    messageId: z.number()
  }),
  async run({ args, action }) {
    console.log('forwardMessage', args, action)
    if (args.chatid) {
      bot.forwardMessage(args.chatid, args.fromChatId, args.messageId)
      return `Forwarded Message successfully`
    }
    if (args.groupName) {
      const chats = await getChat(args.groupName)
      bot.forwardMessage(String(chats!.id), args.fromChatId, args.messageId)
      return `Forwarded Message successfully`
    }
    return "We need Telegram Chat id or Group name to send message";
  }
})

// Add capability to listen to Group
agent.addCapability({
  name: 'listenToGroup',
  description: 'Listens to messages in a Telegram group',
  schema: z.object({
    groupName: z.string().optional().describe('Telegram Group name from which messages has to be listened'),
    chatid: z.number().optional().describe('Telegram Chat id to from which messages has to be listened'),
  }),
  async run({ args, action }) {
    console.log('listenToGroup', args, action)
    let chatid = args.chatid;
    let grpName: string | null | undefined = args.groupName;
    const workspaceid = action?.workspace?.id;
    const agentid = action?.me?.id;
    if (isNotBlank(args.chatid) && args.groupName && isNotBlank(args.groupName)) {
      const chats = await getChat(args.groupName)
      chatid = chats!.id;
      grpName = chats!.title;
    }
    if (!chatid) return 'We need Telegram Chat id or Group name to listen to messages';
    monitoredGroups.push({ id: chatid!, title: grpName, workspaceid: String(workspaceid), agentid: String(agentid) });
    writeFileSync(fileName, JSON.stringify(monitoredGroups, null, 2));
    return 'Group has been added to the monitoring list';
  }
})


async function sendMessage(chatid: number, args: any) {
  let opt: any = {}
  if (isNotBlank(args.message) && !["audio", "video", "image", "document"].includes(args.filetype)) {
    opt.caption = args.message
  }
  if (args.file && args.filetype == "audio") {
    await bot.sendAudio(chatid, args.file, opt)
  } else if (args.file && args.filetype == "video") {
    await bot.sendVideo(chatid, args.file, opt)
  } else if (args.file && args.filetype == "image") {
    await bot.sendPhoto(chatid, args.file, opt)
  } else if (args.file && args.filetype == "document") {
    await bot.sendDocument(chatid, args.file, opt)
  } else {
    let m = args.message;
    if (args.fileUrl) {
      m = `${m} ${args.fileUrl}`
    }
    await bot.sendMessage(chatid, m, opt)
  }
  return `Message sent successfully to ${args.chatid}`
}

function addMonitoredGroup(groupId: number, title: string): void {
  if (!monitoredGroups.some(g => g.id === groupId)) {
    monitoredGroups.push({ id: groupId, title });
    writeFile('monitoredGroups.json', JSON.stringify(monitoredGroups, null, 2), 'utf8', (err) => {
      if (err) { console.error(err); throw err; }
      console.log('The file has been saved!');
    });
  }
}

function removeMonitoredGroup(groupId: number): void {
  if (monitoredGroups.some(g => g.id === groupId)) {
    monitoredGroups = monitoredGroups.filter((g) => g.id !== groupId);
    writeFile('monitoredGroups.json', JSON.stringify(monitoredGroups, null, 2), 'utf8', (err) => {
      if (err) { console.error(err); throw err; }
      console.log('The file has been saved!');
    });
  }
}

// Listen for messages
bot.on('message', (msg) => {
  console.log('On Telegram Message', msg)
  if (!msg.text || (msg.chat.type == 'group' && !monitoredGroups.some(g => g.id == msg.chat.id))) { return }
  if (!msg.text && msg.chat.type == 'group' && msg.group_chat_created) {
    addMonitoredGroup(msg.chat.id, msg.chat.title || 'Unknown');
    return;
  }
  if (msg.text && (msg.chat.type == 'group' && monitoredGroups.some(g => g.id == msg.chat.id))) {
    if (!msg.text?.includes(`@${process.env.TELEGRAM_BOT_NAME}`)) { return } // later restrict to listen for bot name tagged messages alone
  } else if (!msg.text || (msg.chat.type == 'private')) {
    // This is section needs to be change, so that Platform takes up these kind of messages from customer and creates task out of this.
    agent.process({
      messages: [
        {
          role: "user",
          content: `
You are an advanced AI assistant with a deep understanding of human communication patterns and the ability to interpret user intentions from brief messages or pings. Your expertise lies in analyzing the context, tone, and implied actions behind user inputs, whether they are casual messages, requests for reports, or specific commands. Your goal is to decode the user's intent and generate an appropriate, actionable response that aligns perfectly with their needs.

Your task is to interpret the user's ping and generate a response or action based on the implied intent. The ping could range from a simple Telegram message to a request for generating a detailed report or performing a specific task. You must carefully analyze the input, identify the underlying action, and provide a clear, concise, and contextually appropriate response.

Here are the details to keep in mind:

The user's ping may be brief or informal, so you must infer the context and intent accurately.
The action could involve replying to a message, generating a report, summarizing data, or performing a specific task.
Ensure the response is tailored to the user's tone and level of formality.
If the ping is ambiguous, ask clarifying questions to ensure the response aligns with the user's expectations.
For example, if the user sends a ping like "Send me the sales report," you should interpret this as a request to generate and deliver a detailed sales report. If the ping is "Hey, can you help me with this?" you should ask clarifying questions to understand the specific assistance required.

Now, interpret the following user ping and generate an appropriate response:
Reply to Chat: ${msg.chat?.id}
User Ping: ${msg.text}`
        }
      ]
    }).then((response) => {
      console.log('Response from agent', response)
      if (response.choices && response.choices.length > 0) {
        response.choices.forEach((choice) => {
          if (choice.message && choice.message.content) {
            bot.sendMessage(msg.chat.id, choice.message.content)
          }
        })
      }
    })
  } else return;

})

// Start the agent's HTTP server
agent.start()
