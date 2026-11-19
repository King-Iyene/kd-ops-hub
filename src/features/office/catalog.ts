import type { ItemType } from './world/types';

/** The object picker: what can be placed, grouped the way people look for it. */
export const CATEGORIES: { id: string; label: string; types: ItemType[] }[] = [
  { id: 'seating', label: 'Seating', types: ['chair', 'stool', 'sofa', 'beanbag', 'bench'] },
  { id: 'desks', label: 'Desks and tables', types: ['desk', 'standingdesk', 'execdesk', 'cornerdesk', 'table', 'roundtable', 'coffeetable', 'filecabinet'] },
  { id: 'tech', label: 'Tech', types: ['computer', 'dualmonitor', 'ultrawide', 'laptop', 'tv', 'printer', 'speaker', 'headphones'] },
  { id: 'ontop', label: 'On the desk', types: ['papers', 'books', 'mug', 'plate', 'globe', 'trophy', 'pizza'] },
  { id: 'plants', label: 'Plants and garden', types: ['plant', 'monstera', 'flowers', 'sunflowers', 'orchid', 'lavender', 'tulips', 'cactus', 'bamboo', 'tree', 'palm', 'hedge', 'grass', 'fountain'] },
  { id: 'nature', label: 'Water and nature', types: ['pond', 'waterfall', 'sea', 'sand', 'dock', 'boat', 'dogball', 'beachchair', 'umbrella', 'towel', 'sandcastle', 'flowerbed', 'rocks', 'birdbath', 'fountain'] },
  { id: 'forest', label: 'Forest and camp', types: ['pinetree', 'campfire', 'log', 'stump', 'tent', 'firewood', 'lantern', 'mushrooms', 'tree', 'bamboo'] },
  { id: 'floor', label: 'Rugs and mats', types: ['rug', 'mat'] },
  { id: 'decor', label: 'Decor', types: ['lamp', 'balloons', 'frame', 'barchart', 'orgchart', 'worldmap', 'kanban', 'whiteboard', 'shelf', 'fishtank', 'fireplace', 'piano'] },
  { id: 'info', label: 'Info boards', types: ['valueswall', 'noticeboard', 'wallclock'] },
  { id: 'fun', label: 'Fun', types: ['bike', 'kart', 'foosball', 'tabletennis', 'arcade', 'phonebooth', 'gong', 'gametable'] },
  { id: 'pets', label: 'Pets', types: ['dog', 'cat'] },
  { id: 'kitchen', label: 'Kitchen and more', types: ['coffeebar', 'coffee', 'cooler', 'vending', 'bin'] },
];
