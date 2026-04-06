const { WebSocketServer } = require('ws')
const http = require('http')
const fs = require('fs')
const path = require('path')
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js')

const PORT = process.env.PORT || 8080
const SECRET = process.env.SECRET || 'babkapaste'
const BOT_TOKEN = process.env.BOT_TOKEN || ''
const GUILD_ID = process.env.GUILD_ID || ''

// kill list: set of pc names to kill
const killList = new Set()

// ---- HTTP + WS server ----
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost`)

  // cheat polls: GET /check?pc=USERNAME
  if ( url.pathname === '/check' ) {
    const pc = url.searchParams.get('pc') || ''
    if ( killList.has(pc) ) {
      killList.delete(pc)
      res.writeHead(200)
      res.end('kill')
    } else {
      res.writeHead(200)
      res.end('ok')
    }
    return
  }

  // radar page
  const html = fs.readFileSync(path.join(__dirname, 'radar.html'), 'utf8')
  res.writeHead(200, { 'Content-Type': 'text/html' })
  res.end(html)
})

const wss = new WebSocketServer({ server })
let source = null
let lastData = null

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://localhost`)
  const secretParam = url.searchParams.get('secret')
  const secretHeader = req.headers['x-secret']
  const isCheat = secretParam === SECRET || secretHeader === SECRET

  if (isCheat) {
    if (source) source.terminate()
    source = ws
    ws.on('message', data => {
      lastData = data
      wss.clients.forEach(c => { if (c !== source && c.readyState === 1) c.send(data) })
    })
    ws.on('close', () => { if (source === ws) source = null })
    return
  }

  if (lastData) ws.send(lastData)
  ws.on('close', () => {})
})

server.listen(PORT, () => console.log(`server running on :${PORT}`))

// ---- Discord bot ----
const client = new Client({ intents: [GatewayIntentBits.Guilds] })

client.once('ready', async () => {
  console.log(`bot logged in as ${client.user.tag}`)

  // register slash command
  const commands = [
    new SlashCommandBuilder()
      .setName('kill')
      .setDescription('Kill cheat on a specific PC')
      .addStringOption(opt => opt.setName('pc').setDescription('PC username').setRequired(true)),
    new SlashCommandBuilder()
      .setName('killall')
      .setDescription('Kill cheat on all PCs'),
  ].map(c => c.toJSON())

  const rest = new REST({ version: '10' }).setToken(BOT_TOKEN)
  try {
    if (GUILD_ID) {
      await rest.put(Routes.applicationGuildCommands(client.user.id, GUILD_ID), { body: commands })
    } else {
      await rest.put(Routes.applicationCommands(client.user.id), { body: commands })
    }
    console.log('slash commands registered')
  } catch (e) {
    console.error('failed to register commands:', e.message)
  }
})

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return

  if (interaction.commandName === 'kill') {
    const pc = interaction.options.getString('pc')
    killList.add(pc)
    await interaction.reply({ content: `✅ Kill command queued for **${pc}**`, flags: 64 })
  }

  if (interaction.commandName === 'killall') {
    killList.add('*')
    await interaction.reply({ content: '✅ Kill command queued for **all** PCs', flags: 64 })
  }
})

client.login(BOT_TOKEN)
