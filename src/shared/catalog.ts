// Example roster verified against PokéAPI species, types and evolution chains.
export const EGG_TYPES = [
  {
    "id": "normal",
    "name": "노말",
    "color": "#a8a878"
  },
  {
    "id": "fire",
    "name": "불꽃",
    "color": "#ef8050"
  },
  {
    "id": "water",
    "name": "물",
    "color": "#6890f0"
  },
  {
    "id": "electric",
    "name": "전기",
    "color": "#e5ba31"
  },
  {
    "id": "grass",
    "name": "풀",
    "color": "#78ad55"
  },
  {
    "id": "ice",
    "name": "얼음",
    "color": "#70bebe"
  },
  {
    "id": "fighting",
    "name": "격투",
    "color": "#c7655c"
  },
  {
    "id": "poison",
    "name": "독",
    "color": "#a568b3"
  },
  {
    "id": "ground",
    "name": "땅",
    "color": "#bc995c"
  },
  {
    "id": "flying",
    "name": "비행",
    "color": "#9181c2"
  },
  {
    "id": "psychic",
    "name": "에스퍼",
    "color": "#e76894"
  },
  {
    "id": "bug",
    "name": "벌레",
    "color": "#93a834"
  },
  {
    "id": "rock",
    "name": "바위",
    "color": "#a59457"
  },
  {
    "id": "ghost",
    "name": "고스트",
    "color": "#8067a0"
  },
  {
    "id": "dragon",
    "name": "드래곤",
    "color": "#7862d0"
  },
  {
    "id": "dark",
    "name": "악",
    "color": "#78665a"
  },
  {
    "id": "steel",
    "name": "강철",
    "color": "#9194af"
  },
  {
    "id": "fairy",
    "name": "페어리",
    "color": "#d897b0"
  }
] as const
export type EggType = typeof EGG_TYPES[number]['id']
export const FAMILIES = [
  {
    "family": 0,
    "eggTypes": [
      "grass",
      "poison"
    ],
    "species": [
      1,
      2,
      3
    ]
  },
  {
    "family": 1,
    "eggTypes": [
      "fire"
    ],
    "species": [
      4,
      5,
      6
    ]
  },
  {
    "family": 2,
    "eggTypes": [
      "water"
    ],
    "species": [
      7,
      8,
      9
    ]
  },
  {
    "family": 3,
    "eggTypes": [
      "normal"
    ],
    "species": [
      19,
      20
    ]
  },
  {
    "family": 4,
    "eggTypes": [
      "electric"
    ],
    "species": [
      172,
      25,
      26
    ]
  },
  {
    "family": 5,
    "eggTypes": [
      "ice",
      "water"
    ],
    "species": [
      363,
      364,
      365
    ]
  },
  {
    "family": 6,
    "eggTypes": [
      "fighting"
    ],
    "species": [
      66,
      67,
      68
    ]
  },
  {
    "family": 7,
    "eggTypes": [
      "poison"
    ],
    "species": [
      29,
      30,
      31
    ]
  },
  {
    "family": 8,
    "eggTypes": [
      "ground"
    ],
    "species": [
      27,
      28
    ]
  },
  {
    "family": 9,
    "eggTypes": [
      "normal",
      "flying"
    ],
    "species": [
      16,
      17,
      18
    ]
  },
  {
    "family": 10,
    "eggTypes": [
      "psychic"
    ],
    "species": [
      63,
      64,
      65
    ]
  },
  {
    "family": 11,
    "eggTypes": [
      "bug"
    ],
    "species": [
      10,
      11,
      12
    ]
  },
  {
    "family": 12,
    "eggTypes": [
      "rock",
      "ground"
    ],
    "species": [
      74,
      75,
      76
    ]
  },
  {
    "family": 13,
    "eggTypes": [
      "ghost",
      "poison"
    ],
    "species": [
      92,
      93,
      94
    ]
  },
  {
    "family": 14,
    "eggTypes": [
      "dragon"
    ],
    "species": [
      147,
      148,
      149
    ]
  },
  {
    "family": 15,
    "eggTypes": [
      "dark",
      "dragon"
    ],
    "species": [
      633,
      634,
      635
    ]
  },
  {
    "family": 16,
    "eggTypes": [
      "steel",
      "rock"
    ],
    "species": [
      304,
      305,
      306
    ]
  },
  {
    "family": 17,
    "eggTypes": [
      "fairy"
    ],
    "species": [
      173,
      35,
      36
    ]
  }
] as const
export const POKEMON = [
  {
    "id": 1,
    "name": "이상해씨",
    "family": 0,
    "phase": 1,
    "types": [
      "grass",
      "poison"
    ]
  },
  {
    "id": 2,
    "name": "이상해풀",
    "family": 0,
    "phase": 2,
    "types": [
      "grass",
      "poison"
    ]
  },
  {
    "id": 3,
    "name": "이상해꽃",
    "family": 0,
    "phase": 3,
    "types": [
      "grass",
      "poison"
    ]
  },
  {
    "id": 4,
    "name": "파이리",
    "family": 1,
    "phase": 1,
    "types": [
      "fire"
    ]
  },
  {
    "id": 5,
    "name": "리자드",
    "family": 1,
    "phase": 2,
    "types": [
      "fire"
    ]
  },
  {
    "id": 6,
    "name": "리자몽",
    "family": 1,
    "phase": 3,
    "types": [
      "fire",
      "flying"
    ]
  },
  {
    "id": 7,
    "name": "꼬부기",
    "family": 2,
    "phase": 1,
    "types": [
      "water"
    ]
  },
  {
    "id": 8,
    "name": "어니부기",
    "family": 2,
    "phase": 2,
    "types": [
      "water"
    ]
  },
  {
    "id": 9,
    "name": "거북왕",
    "family": 2,
    "phase": 3,
    "types": [
      "water"
    ]
  },
  {
    "id": 19,
    "name": "꼬렛",
    "family": 3,
    "phase": 1,
    "types": [
      "normal"
    ]
  },
  {
    "id": 20,
    "name": "레트라",
    "family": 3,
    "phase": 2,
    "types": [
      "normal"
    ]
  },
  {
    "id": 172,
    "name": "피츄",
    "family": 4,
    "phase": 1,
    "types": [
      "electric"
    ]
  },
  {
    "id": 25,
    "name": "피카츄",
    "family": 4,
    "phase": 2,
    "types": [
      "electric"
    ]
  },
  {
    "id": 26,
    "name": "라이츄",
    "family": 4,
    "phase": 3,
    "types": [
      "electric"
    ]
  },
  {
    "id": 363,
    "name": "대굴레오",
    "family": 5,
    "phase": 1,
    "types": [
      "ice",
      "water"
    ]
  },
  {
    "id": 364,
    "name": "씨레오",
    "family": 5,
    "phase": 2,
    "types": [
      "ice",
      "water"
    ]
  },
  {
    "id": 365,
    "name": "씨카이저",
    "family": 5,
    "phase": 3,
    "types": [
      "ice",
      "water"
    ]
  },
  {
    "id": 66,
    "name": "알통몬",
    "family": 6,
    "phase": 1,
    "types": [
      "fighting"
    ]
  },
  {
    "id": 67,
    "name": "근육몬",
    "family": 6,
    "phase": 2,
    "types": [
      "fighting"
    ]
  },
  {
    "id": 68,
    "name": "괴력몬",
    "family": 6,
    "phase": 3,
    "types": [
      "fighting"
    ]
  },
  {
    "id": 29,
    "name": "니드런♀",
    "family": 7,
    "phase": 1,
    "types": [
      "poison"
    ]
  },
  {
    "id": 30,
    "name": "니드리나",
    "family": 7,
    "phase": 2,
    "types": [
      "poison"
    ]
  },
  {
    "id": 31,
    "name": "니드퀸",
    "family": 7,
    "phase": 3,
    "types": [
      "poison",
      "ground"
    ]
  },
  {
    "id": 27,
    "name": "모래두지",
    "family": 8,
    "phase": 1,
    "types": [
      "ground"
    ]
  },
  {
    "id": 28,
    "name": "고지",
    "family": 8,
    "phase": 2,
    "types": [
      "ground"
    ]
  },
  {
    "id": 16,
    "name": "구구",
    "family": 9,
    "phase": 1,
    "types": [
      "normal",
      "flying"
    ]
  },
  {
    "id": 17,
    "name": "피죤",
    "family": 9,
    "phase": 2,
    "types": [
      "normal",
      "flying"
    ]
  },
  {
    "id": 18,
    "name": "피죤투",
    "family": 9,
    "phase": 3,
    "types": [
      "normal",
      "flying"
    ]
  },
  {
    "id": 63,
    "name": "캐이시",
    "family": 10,
    "phase": 1,
    "types": [
      "psychic"
    ]
  },
  {
    "id": 64,
    "name": "윤겔라",
    "family": 10,
    "phase": 2,
    "types": [
      "psychic"
    ]
  },
  {
    "id": 65,
    "name": "후딘",
    "family": 10,
    "phase": 3,
    "types": [
      "psychic"
    ]
  },
  {
    "id": 10,
    "name": "캐터피",
    "family": 11,
    "phase": 1,
    "types": [
      "bug"
    ]
  },
  {
    "id": 11,
    "name": "단데기",
    "family": 11,
    "phase": 2,
    "types": [
      "bug"
    ]
  },
  {
    "id": 12,
    "name": "버터플",
    "family": 11,
    "phase": 3,
    "types": [
      "bug",
      "flying"
    ]
  },
  {
    "id": 74,
    "name": "꼬마돌",
    "family": 12,
    "phase": 1,
    "types": [
      "rock",
      "ground"
    ]
  },
  {
    "id": 75,
    "name": "데구리",
    "family": 12,
    "phase": 2,
    "types": [
      "rock",
      "ground"
    ]
  },
  {
    "id": 76,
    "name": "딱구리",
    "family": 12,
    "phase": 3,
    "types": [
      "rock",
      "ground"
    ]
  },
  {
    "id": 92,
    "name": "고오스",
    "family": 13,
    "phase": 1,
    "types": [
      "ghost",
      "poison"
    ]
  },
  {
    "id": 93,
    "name": "고우스트",
    "family": 13,
    "phase": 2,
    "types": [
      "ghost",
      "poison"
    ]
  },
  {
    "id": 94,
    "name": "팬텀",
    "family": 13,
    "phase": 3,
    "types": [
      "ghost",
      "poison"
    ]
  },
  {
    "id": 147,
    "name": "미뇽",
    "family": 14,
    "phase": 1,
    "types": [
      "dragon"
    ]
  },
  {
    "id": 148,
    "name": "신뇽",
    "family": 14,
    "phase": 2,
    "types": [
      "dragon"
    ]
  },
  {
    "id": 149,
    "name": "망나뇽",
    "family": 14,
    "phase": 3,
    "types": [
      "dragon",
      "flying"
    ]
  },
  {
    "id": 633,
    "name": "모노두",
    "family": 15,
    "phase": 1,
    "types": [
      "dark",
      "dragon"
    ]
  },
  {
    "id": 634,
    "name": "디헤드",
    "family": 15,
    "phase": 2,
    "types": [
      "dark",
      "dragon"
    ]
  },
  {
    "id": 635,
    "name": "삼삼드래",
    "family": 15,
    "phase": 3,
    "types": [
      "dark",
      "dragon"
    ]
  },
  {
    "id": 304,
    "name": "가보리",
    "family": 16,
    "phase": 1,
    "types": [
      "steel",
      "rock"
    ]
  },
  {
    "id": 305,
    "name": "갱도라",
    "family": 16,
    "phase": 2,
    "types": [
      "steel",
      "rock"
    ]
  },
  {
    "id": 306,
    "name": "보스로라",
    "family": 16,
    "phase": 3,
    "types": [
      "steel",
      "rock"
    ]
  },
  {
    "id": 173,
    "name": "삐",
    "family": 17,
    "phase": 1,
    "types": [
      "fairy"
    ]
  },
  {
    "id": 35,
    "name": "삐삐",
    "family": 17,
    "phase": 2,
    "types": [
      "fairy"
    ]
  },
  {
    "id": 36,
    "name": "픽시",
    "family": 17,
    "phase": 3,
    "types": [
      "fairy"
    ]
  }
] as const
