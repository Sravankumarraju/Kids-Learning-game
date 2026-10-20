// What each construction stage teaches: real facts (a different one for each project), a method choice and quizzes.
// good: false choices are explained kindly and the builders use the right method anyway (one star less).

export const LESSONS = [
  { // survey
    facts: [
      'Surveyors measure the land and hammer a peg into every corner. String between the pegs shows exactly where the walls will go.',
      'Builders check the corners are square by measuring both diagonals. If the two diagonals are the same length, every corner is a right angle!',
      'The front of the building faces the street, so visitors can find the door.',
    ],
    task: 'Tap the glowing pegs in order: 1, 2, 3, 4.',
  },
  { // clear
    facts: [
      'Bushes, rocks and rubbish are removed so the building stands on clean, firm ground.',
      'A bulldozer has a wide steel blade. It pushes everything off the plot in a few minutes.',
      'Good builders keep the cleared stones. They can be used later for the garden.',
    ],
    choice: { q: 'How shall we clear the plot?', opts: [
      { id: 'dozer', label: '🚜 Bulldozer', good: true, why: 'Fast and powerful — hold the button to push the rubbish away.' },
      { id: 'crew', label: '👷 Workers with spades', good: true, why: 'Quiet and careful — tap each bush, rock or junk to send a worker.' },
    ] },
  },
  { // dig
    facts: [
      'Foundation trenches are dug under every wall, about 1 metre deep, down to firm soil.',
      'A foundation spreads the heavy building over more ground — like wide snowshoes stop you sinking into snow.',
      'The dug-out soil is kept in heaps beside the trench. Later it goes back in to fill the gaps.',
    ],
    choice: { q: 'Which machine will dig the trenches?', opts: [
      { id: 'excavator', label: '🦾 Tracked excavator', good: true, why: 'A long arm on caterpillar tracks — it digs deep and fast.' },
      { id: 'backhoe', label: '🚜 JCB backhoe', good: true, why: 'A loader at the front and a digger at the back — India’s favourite site machine.' },
    ] },
    task: 'Hold DIG to lower the bucket. Let go when the needle is in the green zone (1 metre deep).',
  },
  { // steel
    facts: [
      'Concrete is strong when squeezed but cracks when bent. Steel bars inside make it strong both ways. This is called RCC — reinforced cement concrete.',
      'Bars are tied together with thin binding wire to make a cage, so nothing moves when concrete is poured.',
      'Little cover blocks lift the cage off the soil, so concrete wraps all around the steel and stops rust.',
    ],
    choice: { q: 'How far apart should the steel rings (stirrups) be?', opts: [
      { id: '15', label: 'About 15 cm', good: true, why: 'Yes! Close rings make a strong cage.' },
      { id: '50', label: 'About 50 cm', good: false, why: 'Too far apart — the cage would be weak. Our builders will use 15 cm.' },
    ] },
    task: 'Tap each glowing trench to lower a steel cage into it.',
  },
  { // footing
    facts: [
      'Concrete is cement, sand, stones and water mixed together. It starts soft and sets as hard as rock.',
      'A transit mixer keeps its drum turning all the way, so the concrete never sets inside.',
      'The footing is the wide concrete base at the bottom of the trench. The walls stand on it.',
    ],
    choice: { q: 'Which mix makes good footing concrete? (cement : sand : stones)', opts: [
      { id: '124', label: '1 : 2 : 4', good: true, why: 'Perfect — that is the standard mix for footings.' },
      { id: '1816', label: '1 : 8 : 16', good: false, why: 'Too little cement — it would crumble. We will use 1 : 2 : 4.' },
      { id: 'cem', label: 'Only cement', good: false, why: 'Too costly, and pure cement cracks as it dries. We will use 1 : 2 : 4.' },
    ] },
    task: 'Hold POUR. Let go when the concrete reaches the green line.',
  },
  { // plinth
    facts: [
      'The plinth lifts the floor above the ground, so rainwater stays outside.',
      'A damp-proof course (DPC) is a waterproof black layer on top of the plinth. It stops ground water creeping up the walls.',
      'The trenches are filled with the dug soil and pressed hard with a roller, so the floor never sinks.',
    ],
    choice: { q: 'What do we do with the soil we fill back in?', opts: [
      { id: 'roll', label: 'Press it hard with a roller', good: true, why: 'Right! Compacted soil will not sink.' },
      { id: 'loose', label: 'Leave it loose', good: false, why: 'Loose soil sinks and the floor would crack. We will roll it.' },
    ] },
  },
  { // columns
    facts: [
      'Columns carry the weight of the floors and the roof down into the foundation.',
      'Wet concrete is poured into wooden boxes called shuttering. When it is hard, the boxes come off.',
      'A concrete pump has a long folding arm, so it can reach high places that a wheelbarrow cannot.',
    ],
    choice: { q: 'How do we look after new concrete?', opts: [
      { id: 'cure', label: 'Keep it wet for 7 days', good: true, why: 'Yes! This is called curing. Slow drying makes concrete strongest.' },
      { id: 'sun', label: 'Dry it fast in the hot sun', good: false, why: 'Fast drying makes cracks. Builders keep it wet for a week.' },
    ] },
    task: 'Tap each column to pump concrete into it.',
  },
  { // walls
    facts: [
      'Bricks are laid in staggered rows so no joints line up. This pattern is called a bond, and it makes the wall strong.',
      'Mortar is cement, sand and water. It glues the bricks together.',
      'A spirit level has a bubble inside. When the bubble sits in the middle, the wall is perfectly level.',
      'A concrete lintel sits over every door and window to hold up the bricks above it.',
    ],
    choice: { q: 'How should the bricks be laid?', opts: [
      { id: 'bond', label: 'Staggered joints', good: true, why: 'Exactly — every brick sits across the joint below it.' },
      { id: 'stack', label: 'Joints in one straight line', good: false, why: 'Straight joints make a weak wall that can split. We will stagger them.' },
    ] },
    task: 'Hold LAY BRICKS. When the spirit level appears, tap CHECK when the bubble is in the middle.',
  },
  { // roof
    slab: {
      facts: [
        'A roof slab is concrete poured on a wooden deck held up by props, with a steel mesh inside.',
        'The props stay for about two weeks, until the slab is strong enough to hold itself up.',
        'The slab of one floor becomes the floor of the next one!',
      ],
      choice: { q: 'When can the props under a new slab come out?', opts: [
        { id: '14', label: 'After about 14 days', good: true, why: 'Right — by then the slab can carry itself.' },
        { id: '1', label: 'The next morning', good: false, why: 'Too soon! The slab could bend or crack. We will wait 14 days.' },
      ] },
    },
    tiles: {
      facts: [
        'Sloping roofs let heavy monsoon rain run off quickly.',
        'Timber trusses are made of triangles. Triangles keep their shape, so they are very strong.',
        'Clay tiles keep a house cool in hot summers.',
      ],
      choice: { q: 'Why is this roof sloped?', opts: [
        { id: 'rain', label: 'So rain runs off', good: true, why: 'Yes! Water slides down and away.' },
        { id: 'tall', label: 'To make it look tall', good: false, why: 'It does look nice, but the real reason is to send rain away quickly.' },
      ] },
    },
    tin: {
      facts: [
        'Metal sheets are light and quick to fix — great for big halls.',
        'Timber trusses are made of triangles. Triangles keep their shape, so they are very strong.',
        'The sheets overlap like fish scales, so rain cannot get in.',
      ],
      choice: { q: 'Why do the roof sheets overlap?', opts: [
        { id: 'rain', label: 'So rain cannot get in', good: true, why: 'Exactly — each sheet sheds water onto the next one.' },
        { id: 'save', label: 'To use more sheets', good: false, why: 'Builders like to save sheets! The overlap is there to keep rain out.' },
      ] },
    },
  },
  { // fittings
    facts: [
      'Electricians run wires inside plastic pipes hidden in the walls. Plumbers fit the water pipes.',
      'Window grills keep a building safe while letting in light and fresh air.',
      'Door frames are fixed into the wall first, then the door is hung on hinges.',
    ],
    task: 'Tap each glowing opening to fit a door or window.',
  },
  { // finish
    facts: [
      'Plaster is a smooth layer of cement and sand. It covers the bricks and keeps out the rain.',
      'Painters put on a primer first, then two coats of paint. Paint protects the walls and adds colour.',
      'Light colours reflect sunlight and keep buildings cooler in summer.',
    ],
    task: 'Swipe across the walls to plaster them, then pick a colour and swipe again to paint.',
  },
  { // handover
    facts: [
      'Before people move in, an inspector checks that everything is safe and strong.',
      'Floor tiles are laid on a bed of mortar, and the gaps are filled with grout.',
      'Trees around a building give shade and keep it cool.',
    ],
    task: 'Choose the floor tiles, then tap the glowing spots to finish the garden.',
  },
];

// quick questions in the fittings stage (a different one for each project)
export const QUIZZES = [
  { q: 'Which wire is the Earth wire that keeps us safe?', opts: [{ id: 'g', label: '🟢 Green', good: true, why: 'Yes! Green (or green-yellow) is Earth.' }, { id: 'r', label: '🔴 Red', why: 'Red is the live wire. Earth is green.' }, { id: 'b', label: '⚫ Black', why: 'Black is neutral. Earth is green.' }] },
  { q: 'Where does the water tank go?', opts: [{ id: 'roof', label: '🏠 On the roof', good: true, why: 'Right! Water flows down by itself — that is gravity.' }, { id: 'floor', label: '⬇️ Under the floor', why: 'Water would have to be pushed up. On the roof, gravity does the work.' }, { id: 'kit', label: '🍳 In the kitchen', why: 'Too small and too low. Tanks go on the roof.' }] },
  { q: 'What lets fresh air into a room?', opts: [{ id: 'w', label: '🪟 Windows', good: true, why: 'Yes! Open windows let fresh air flow through.' }, { id: 'f', label: '🧱 Floor', why: 'The floor is solid. Windows let air in.' }, { id: 'p', label: '🔌 Plugs', why: 'Plugs give electricity. Windows let air in.' }] },
  { q: 'Why do windows have glass?', opts: [{ id: 'l', label: 'Light in, rain out', good: true, why: 'Exactly — sunlight comes in and the rain stays out.' }, { id: 'n', label: 'To make noise', why: 'Glass lets light in and keeps rain out.' }, { id: 'd', label: 'To keep light out', why: 'Glass lets light in!' }] },
  { q: 'What carries electricity to the lights?', opts: [{ id: 'w', label: '🔌 Wires', good: true, why: 'Yes! Copper wires carry the electricity.' }, { id: 'p', label: '🚰 Water pipes', why: 'Pipes carry water. Wires carry electricity.' }, { id: 'r', label: '🧵 String', why: 'String cannot carry electricity. Copper wires can.' }] },
  { q: 'Which way does used water go?', opts: [{ id: 'd', label: '⬇️ Down the drain pipe', good: true, why: 'Right — drain pipes slope down to the sewer.' }, { id: 'u', label: '⬆️ Up to the tank', why: 'Used water goes down the drain, not back to the tank.' }, { id: 's', label: '🌫️ It disappears', why: 'It flows down the drain pipe to the sewer.' }] },
];

export const INSPECTION = ['Foundation strong', 'Walls straight and level', 'Roof waterproof', 'Wiring safe', 'Doors and windows open smoothly'];
