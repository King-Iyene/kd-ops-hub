import { useCallback, useState } from 'react';

/** Reactions: any emoji can be sent (the receiver checks it really is one), the quick bar holds your four favourites. */
export function isEmoji(s: unknown): s is string {
  return typeof s === 'string' && s.length > 0 && s.length <= 16 && /\p{Extended_Pictographic}/u.test(s) && !/[A-Za-z0-9<>]/.test(s);
}

/** One line per emoji: the emoji, then words to search by. */
const RAW: { id: string; label: string; icon: string; lines: string }[] = [
  { id: 'smileys', label: 'Smileys', icon: '😀', lines: `😀 grin happy
😃 smile happy
😄 laugh happy
😁 beam grin
😆 laughing
😅 sweat laugh relief
🤣 rofl lol
😂 joy tears lol
🙂 slight smile
🙃 upside down
😉 wink
😊 blush smile
😇 angel halo
🥰 love hearts
😍 heart eyes love
🤩 star struck wow
😘 kiss
😗 kiss
😚 kiss
😙 kiss
😋 yum tasty
😛 tongue
😜 wink tongue
🤪 zany crazy
😝 tongue squint
🤑 money rich
🤗 hug
🤭 oops giggle
🤫 shh quiet
🤔 think hmm
🤐 zipper secret
🤨 raised brow doubt
😐 neutral
😑 expressionless
😶 silent
😏 smirk
😒 unamused
🙄 eye roll
😬 grimace awkward
🤥 lying
😌 relieved calm
😔 pensive sad
😪 sleepy
🤤 drool
😴 sleep tired
😷 mask sick
🤒 fever sick
🤕 hurt bandage
🤢 nauseous
🤮 vomit
🥵 hot
🥶 cold freezing
🥴 woozy
😵 dizzy
🤯 mind blown
🤠 cowboy
🥳 party celebrate
😎 cool sunglasses
🤓 nerd
🧐 monocle
😕 confused
😟 worried
🙁 frown
😮 wow surprised
😯 hushed
😲 astonished
😳 flushed embarrassed
🥺 pleading puppy
😦 frown
😧 anguish
😨 fear scared
😰 anxious sweat
😥 sad relieved
😢 cry sad
😭 sob cry loud
😱 scream shock
😖 confounded
😣 persevere
😞 disappointed
😓 downcast sweat
😩 weary
😫 tired
🥱 yawn
😤 triumph steam
😡 angry rage
😠 mad angry
🤬 swearing cursing
😈 devil
👿 imp
💀 skull dead
💩 poop
🤡 clown
👻 ghost
👽 alien
🤖 robot
😺 cat happy
😸 cat grin
😹 cat laugh
😻 cat love
🙈 see no evil monkey
🙉 hear no evil monkey
🙊 speak no evil monkey` },
  { id: 'people', label: 'People', icon: '👋', lines: `👋 wave hello bye
🤚 raised back hand
🖐️ hand fingers
✋ raise hand stop high five
🖖 vulcan
👌 ok perfect
🤌 pinched fingers
🤏 tiny pinch
✌️ peace victory
🤞 fingers crossed luck
🤟 love you
🤘 rock on
🤙 call me shaka
👈 left point
👉 right point
👆 up point
👇 down point
☝️ one index
👍 thumbs up yes good like
👎 thumbs down no bad
✊ fist
👊 punch bump
🤛 left fist
🤜 right fist
👏 clap applause bravo
🙌 raised hands celebrate hooray
👐 open hands
🤲 palms up
🤝 handshake deal
🙏 pray thanks please
✍️ writing
💅 nail polish
💪 strong muscle flex
🦾 mechanical arm
🧠 brain smart
👀 eyes look
👁️ eye
👂 ear
👃 nose
👄 mouth
👶 baby
🧒 child
👦 boy
👧 girl
🧑 person
👨 man
👩 woman
🧓 older person
👴 old man
👵 old woman
👨‍💻 man technologist coder
👩‍💻 woman technologist coder
👨‍💼 man office worker
👩‍💼 woman office worker
🧑‍🔧 mechanic
🧑‍🍳 cook chef
🧑‍🏫 teacher
🧑‍⚕️ doctor
🦸 superhero
🦹 supervillain
🧙 mage wizard
🧚 fairy
🧛 vampire
🧜 merperson
🧝 elf
🧞 genie
🧟 zombie
💃 dance woman
🕺 dance man
🚶 walking
🏃 running
🧘 yoga calm meditate
🛌 in bed sleeping
👨‍👩‍👧 family
👫 couple
💑 couple love
💏 kiss couple` },
  { id: 'nature', label: 'Animals and nature', icon: '🐶', lines: `🐶 dog puppy
🐱 cat kitten
🐭 mouse
🐹 hamster
🐰 rabbit bunny
🦊 fox
🐻 bear
🐼 panda
🐨 koala
🐯 tiger
🦁 lion
🐮 cow
🐷 pig
🐸 frog
🐵 monkey
🐔 chicken
🐧 penguin
🐦 bird
🐤 chick
🦆 duck
🦅 eagle
🦉 owl
🦇 bat
🐺 wolf
🐗 boar
🐴 horse
🦄 unicorn
🐝 bee
🐛 bug caterpillar
🦋 butterfly
🐌 snail
🐞 ladybug
🐜 ant
🐢 turtle
🐍 snake
🦎 lizard
🐙 octopus
🦀 crab
🐠 fish tropical
🐟 fish
🐬 dolphin
🐳 whale
🦈 shark
🐊 crocodile
🐘 elephant
🦒 giraffe
🦓 zebra
🐪 camel
🐑 sheep
🐐 goat
🐓 rooster
🌵 cactus
🎄 christmas tree
🌲 evergreen
🌳 tree
🌴 palm tree
🌱 seedling
🌿 herb leaf
☘️ shamrock
🍀 four leaf clover luck
🌸 cherry blossom
🌹 rose
🌺 hibiscus
🌻 sunflower
🌼 blossom
🌷 tulip
🍁 maple leaf
🍂 fallen leaf
🌍 earth africa
🌎 earth americas
🌏 earth asia
🌙 moon crescent
🌞 sun face
⭐ star
🌟 glowing star
✨ sparkles
⚡ lightning
🔥 fire hot lit
🌈 rainbow
☀️ sun
⛅ partly cloudy
☁️ cloud
🌧️ rain
⛈️ storm thunder
❄️ snow
💧 drop water
🌊 wave ocean` },
  { id: 'food', label: 'Food and drink', icon: '🍔', lines: `🍏 green apple
🍎 apple
🍐 pear
🍊 orange tangerine
🍋 lemon
🍌 banana
🍉 watermelon
🍇 grapes
🍓 strawberry
🍒 cherries
🍑 peach
🥭 mango
🍍 pineapple
🥥 coconut
🥝 kiwi
🍅 tomato
🥑 avocado
🍆 eggplant
🥕 carrot
🌽 corn
🌶️ hot pepper spicy
🥔 potato
🍠 sweet potato yam
🍞 bread
🥐 croissant
🥖 baguette
🥞 pancakes
🧀 cheese
🍖 meat bone
🍗 chicken leg
🥩 steak
🥓 bacon
🍔 burger
🍟 fries
🍕 pizza
🌭 hot dog
🥪 sandwich
🌮 taco
🌯 burrito
🍝 spaghetti pasta
🍜 noodles ramen
🍲 stew pot soup
🍛 curry rice
🍣 sushi
🍤 shrimp
🍚 rice
🍙 rice ball
🥟 dumpling
🍦 ice cream
🍩 doughnut
🍪 cookie
🎂 birthday cake
🍰 cake slice
🧁 cupcake
🍫 chocolate
🍬 candy
🍿 popcorn
☕ coffee tea hot
🍵 green tea
🧃 juice box
🥤 cup straw soda
🍺 beer
🍻 cheers beers
🥂 champagne toast cheers
🍷 wine
🥃 whisky
🍹 cocktail
🧉 mate
🥛 milk` },
  { id: 'activity', label: 'Activities', icon: '⚽', lines: `⚽ football soccer
🏀 basketball
🏈 american football
⚾ baseball
🎾 tennis
🏐 volleyball
🏉 rugby
🎱 pool billiards
🏓 ping pong
🏸 badminton
🥊 boxing glove
🥋 martial arts
⛳ golf
🎣 fishing
🎽 running shirt
🛹 skateboard
⛷️ ski
🏂 snowboard
🏋️ weight lifting gym
🤸 cartwheel
🏆 trophy winner champion
🥇 gold medal first
🥈 silver medal second
🥉 bronze medal third
🏅 medal
🎖️ military medal
🎗️ ribbon
🎫 ticket
🎪 circus
🎭 theatre drama masks
🎨 art palette paint
🎬 clapper movie
🎤 microphone sing
🎧 headphones music
🎼 score music
🎹 piano keyboard
🥁 drum
🎷 saxophone
🎺 trumpet
🎸 guitar
🎻 violin
🎲 dice game
🎯 target bullseye focus
🎳 bowling
🎮 video game controller
🧩 puzzle
♟️ chess
🎰 slot machine
🎉 party popper celebrate congrats
🎊 confetti
🎈 balloon
🎁 gift present
🎀 ribbon bow` },
  { id: 'travel', label: 'Travel and places', icon: '🚗', lines: `🚗 car
🚕 taxi
🚙 suv
🚌 bus
🚎 trolleybus
🏎️ race car fast
🚓 police car
🚑 ambulance
🚒 fire truck
🚐 minivan
🚚 truck delivery
🚜 tractor
🛵 scooter
🏍️ motorcycle
🚲 bicycle bike
🛴 kick scooter
🚂 train
🚆 train
🚇 metro
✈️ airplane flight
🛫 takeoff
🛬 landing
🚀 rocket launch
🛸 ufo
🚁 helicopter
⛵ sailboat
🚤 speedboat
🚢 ship
⚓ anchor
⛽ fuel
🚧 construction
🚦 traffic light
🗺️ world map
🗽 statue liberty
🗼 tokyo tower
🏰 castle
🏯 japanese castle
🏟️ stadium
🎡 ferris wheel
⛲ fountain
⛺ camping tent
🏠 house home
🏡 house garden
🏢 office building
🏣 post office
🏥 hospital
🏦 bank
🏨 hotel
🏪 shop store
🏫 school
🏭 factory
⛪ church
🕌 mosque
🛕 temple
🌅 sunrise
🌄 sunrise mountains
🌆 city dusk
🌇 sunset
🌃 night stars
🌉 bridge night` },
  { id: 'objects', label: 'Objects', icon: '💡', lines: `⌚ watch
📱 phone mobile
💻 laptop computer
🖥️ desktop computer
⌨️ keyboard
🖱️ mouse
🖨️ printer
📷 camera
📹 video camera
📺 tv television
📻 radio
⏰ alarm clock
⏳ hourglass time
🔋 battery
🔌 plug
💡 idea light bulb
🔦 flashlight
💰 money bag
💵 dollar cash
💴 yen
💶 euro
💷 pound
💳 credit card
💎 gem diamond
⚖️ scale balance
🔧 wrench tool
🔨 hammer
⚙️ gear settings
🔗 link
🔒 locked
🔓 unlocked
🔑 key
🛡️ shield
📦 package box
📫 mailbox
📧 email
✉️ envelope
📝 memo note write
📄 page document
📊 bar chart stats
📈 chart up growth
📉 chart down
📅 calendar
📌 pin
📎 paperclip
✂️ scissors
📚 books
📖 open book
🔬 microscope
🔭 telescope
💊 pill medicine
🩺 stethoscope
🧪 test tube
🧹 broom
🧺 basket laundry
🚪 door
🛏️ bed
🛋️ couch
🚽 toilet
🧴 lotion
🔔 bell
📢 loudspeaker
🏷️ label tag` },
  { id: 'symbols', label: 'Symbols', icon: '❤️', lines: `❤️ red heart love
🧡 orange heart
💛 yellow heart
💚 green heart
💙 blue heart
💜 purple heart
🖤 black heart
🤍 white heart
🤎 brown heart
💔 broken heart
❣️ heart exclamation
💕 two hearts
💞 revolving hearts
💓 beating heart
💗 growing heart
💖 sparkling heart
💘 heart arrow
💝 heart ribbon
💯 hundred perfect
💢 anger
💥 boom collision
💫 dizzy star
💦 sweat drops
💨 dash wind
💬 speech bubble chat
💭 thought bubble
💤 zzz sleep
✅ check done yes
☑️ ballot check
✔️ check mark
❌ cross no
❎ cross mark
❓ question
❔ white question
❗ exclamation
❕ white exclamation
‼️ double exclamation
⚠️ warning
🚫 prohibited no
🔴 red circle
🟠 orange circle
🟡 yellow circle
🟢 green circle
🔵 blue circle
🟣 purple circle
⚫ black circle
⚪ white circle
🔺 red triangle
🔻 down triangle
♻️ recycle
➕ plus
➖ minus
➗ divide
✖️ multiply
♾️ infinity
🆗 ok
🆕 new
🆒 cool
🆓 free
🔝 top
🔜 soon
🔥 hot fire
🎵 note music
🎶 notes music` },
  { id: 'flags', label: 'Flags', icon: '🏁', lines: `🏁 chequered flag finish race
🚩 red flag
🎌 crossed flags
🏴 black flag
🏳️ white flag
🏳️‍🌈 rainbow flag pride
🇳🇬 nigeria
🇬🇭 ghana
🇰🇪 kenya
🇿🇦 south africa
🇪🇬 egypt
🇪🇹 ethiopia
🇨🇲 cameroon
🇸🇳 senegal
🇹🇿 tanzania
🇺🇬 uganda
🇷🇼 rwanda
🇺🇸 usa united states
🇬🇧 uk united kingdom
🇨🇦 canada
🇫🇷 france
🇩🇪 germany
🇮🇹 italy
🇪🇸 spain
🇵🇹 portugal
🇳🇱 netherlands
🇮🇳 india
🇨🇳 china
🇯🇵 japan
🇰🇷 south korea
🇦🇪 uae emirates
🇸🇦 saudi arabia
🇧🇷 brazil
🇦🇷 argentina
🇲🇽 mexico
🇦🇺 australia
🇺🇳 united nations` },
];

export interface EmojiEntry { e: string; words: string }
export interface EmojiGroup { id: string; label: string; icon: string; items: EmojiEntry[] }

export const EMOJI_GROUPS: EmojiGroup[] = RAW.map((g) => ({
  id: g.id,
  label: g.label,
  icon: g.icon,
  items: g.lines.split('\n').map((line) => {
    const i = line.indexOf(' ');
    return { e: line.slice(0, i), words: line.slice(i + 1).toLowerCase() };
  }),
}));

export const ALL_EMOJI: EmojiEntry[] = EMOJI_GROUPS.flatMap((g) => g.items);

/** Emoji whose words contain every typed word. */
export function searchEmoji(query: string): EmojiEntry[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return ALL_EMOJI.filter((x) => words.every((w) => x.words.includes(w)));
}

export const DEFAULT_QUICK = ['👍', '👏', '❤️', '🎉'];
const QUICK_KEY = 'kd:office:emotes';
const FREQ_KEY = 'kd:office:emotes-used';

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** The four emoji on your bar, and how often you use each (kept on this device). */
export function useEmoteBar() {
  const [quick, setQuickRaw] = useState<string[]>(() => {
    const q = readJson<unknown>(QUICK_KEY, DEFAULT_QUICK);
    return Array.isArray(q) && q.length === 4 && q.every(isEmoji) ? (q as string[]) : DEFAULT_QUICK;
  });
  const [freq, setFreq] = useState<Record<string, number>>(() => readJson<Record<string, number>>(FREQ_KEY, {}));
  const setQuick = useCallback((q: string[]) => {
    setQuickRaw(q);
    try { localStorage.setItem(QUICK_KEY, JSON.stringify(q)); } catch { /* fine */ }
  }, []);
  const bump = useCallback((e: string) => {
    setFreq((f) => {
      const next = { ...f, [e]: (f[e] ?? 0) + 1 };
      try { localStorage.setItem(FREQ_KEY, JSON.stringify(next)); } catch { /* fine */ }
      return next;
    });
  }, []);
  return { quick, setQuick, freq, bump };
}

/** Your most used emoji, most used first. */
export function topUsed(freq: Record<string, number>, n = 16): string[] {
  return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, n).map(([e]) => e).filter(isEmoji);
}

/** Swap an emoji into the four-slot bar (it replaces the oldest one; picking one already there removes it, keeping four). */
export function toggleQuick(quick: string[], e: string): string[] {
  if (quick.includes(e)) return quick;
  return [...quick.slice(1), e];
}
