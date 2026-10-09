// Floor 1 text and scripted barks

export const scrollText = [
  "The Tide asks only for fire.",
  "Floor by floor, we give it.",
  "My people keep breathing. Mostly.",
  "— O.S."
];

export const potionTexts = {
  potion_red: "Forge-draught. Tastes like hot iron.",
  potion_blue: "Swamp tonic. Don't ask what's in it.",
  potion_green: "Smells like the Tide. Drink anyway?"
};

export const scriptedBarks = {
  drowned_dwarf_first: [
    { speaker: 'brannoc', text: "That's... a Stonevow crest on him." },
    { speaker: 'mags', text: "Family reunion. Lovely." }
  ],
  tide_spawn_first: [
    { speaker: 'ilsevar', text: "It's singing. Can nobody else hear it?" }
  ],
  drinking_potion: [
    { speaker: 'mags', text: "Bottoms up. Brannoc, don't look." }
  ],
  opening_chest: [
    { speaker: 'brannoc', text: "Dwarven lock. Mags, you're useless here." },
    { speaker: 'mags', text: "Already open, beardy." }
  ]
};
