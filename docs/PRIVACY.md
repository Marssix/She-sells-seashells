# Privacy Policy – She Sells Seashells

**Effective: November 12, 2026**

This Privacy Policy explains what information the Discord bot **She Sells Seashells** ("the bot", "we", "us") processes, why, and who it is shared with. The bot is a hobby project, and its source code is publicly available at <https://github.com/Marssix/She-sells-seashells>.

## 1. Data controller and contact
The data controller is the operator of the bot (GitHub user **Marssix**).
For privacy matters, contact us by opening an issue at <https://github.com/Marssix/She-sells-seashells/issues>. Please do not include personal information in the issue. If needed, we will arrange a private way to get in touch.

## 2. Information we process

| Information | Source | Purpose |
|---|---|---|
| Discord user ID, username and server display name | Discord, when you use a command or button | Running the game: who the seller is, whose turn it is, your name in the result message |
| Server, channel and thread IDs | Discord | Linking the game to the right thread |
| The content of messages you write **in your game thread while the game is running** | Discord | Your sales pitch is passed to the AI buyer so it can respond |
| Use of commands and buttons | Discord | Game actions (starting a game, accepting an offer, giving up) |

**Other messages:** The bot has Discord's *Message Content* permission so it can read sales pitches. Because of this, Discord also delivers other messages from channels the bot can access. The bot immediately ignores every message that is not from the seller of an active game in that game's own thread. Ignored messages are not stored, logged or forwarded.

We **do not collect** email addresses, payment details, location data or any information other than what is listed above.

### Voice mode (not yet available)
A planned voice mode would listen to the player's speech in a voice channel and convert it to text. We will update this policy and explain how voice data is handled before the feature is released. Our principle is that audio will not be recorded or stored.

## 3. Legal basis
Processing is based on **legitimate interest** (EU General Data Protection Regulation, Art. 6(1)(f)). The information is needed to provide the game that you start yourself, and we process only what is necessary for the game to work.

## 4. Who we share information with
- **Anthropic (Claude API):** the AI buyer's replies are generated with Anthropic's Claude model. We send Anthropic **the text of your sales pitch** and the game state (for example, the buyer character, the product and the meter values). Your Discord IDs and name are **not** sent. By default, Anthropic does not use data sent through its API to train its models. Learn more: <https://www.anthropic.com/legal/privacy>.
- **Discord:** all game messages pass through Discord, which processes them under its own terms: <https://discord.com/privacy>.
- **Hosting:** the bot runs on the operator's computer or a cloud server, and the hosting provider may technically process the bot's log data.

We do not sell information or use it for advertising.

## 5. Transfers outside the EU
Anthropic and Discord also process data in the United States. These transfers rely on the transfer mechanisms approved by the EU that these providers use, such as the EU–US Data Privacy Framework and the European Commission's Standard Contractual Clauses.

## 6. How long information is kept
- **Game state and conversation history** are kept only in the bot's memory. They are deleted when the game ends or the bot restarts. The bot does not currently store anything in a permanent database.
- **Messages on Discord:** the game thread and its messages stay on Discord according to your server's settings. You can delete your own messages on Discord at any time.
- **Technical logs** may contain your display name, the chosen buyer, the game result and error messages. Logs are kept for no more than 30 days for troubleshooting.
- **Anthropic** retains API requests according to its own policies (see section 4).

### Future leaderboards
If the bot later gets permanent profiles and leaderboards, we will store your Discord ID and game statistics for them. We will update this policy before that feature is released.

## 7. Your rights
Under the EU General Data Protection Regulation, you have the right to:
- know what information about you is processed
- request that your information be corrected or deleted
- object to the processing
- lodge a complaint with a supervisory authority. In Finland, this is the Office of the Data Protection Ombudsman: <https://tietosuoja.fi/en>.

Because the bot does not store information permanently, in most cases there is nothing about you to delete. Contact us as described in section 1. You can also stop all processing by no longer using the bot, and a server administrator can remove the bot from their server.

## 8. Age requirement
The bot is intended for Discord users, and Discord's age requirements apply to it. The minimum age is 13, and it is higher in some countries.

## 9. Security
Information is kept only while a game is running. API keys are stored separately from the source code. Connections to Discord and Anthropic are encrypted (HTTPS/TLS).

## 10. Changes
We may update this policy, for example when the bot gets new features. Changes and their history are visible in this file's version history on GitHub. We will announce significant changes before they take effect.
