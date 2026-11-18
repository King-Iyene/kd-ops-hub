import type { ItemType } from './world/types';

/** The object picker: what can be placed, grouped the way people look for it. */
export const CATEGORIES: { id: string; label: string; types: ItemType[] }[] = [
  { id: 'seating', label: 'Seating', types: ['chair', 'stool', 'sofa', 'beanbag', 'bench'] },
  { id: 'desks', label: 'Desks and tables', types: ['desk', 'table', 'roundtable', 'coffeetable'] },
  { id: 'tech', label: 'Tech', types: ['computer', 'laptop', 'tv', 'printer', 'speaker', 'headphones'] },
  { id: 'ontop', label: 'On the desk', types: ['papers', 'books', 'mug', 'plate', 'globe', 'trophy', 'pizza'] },
  { id: 'plants', label: 'Plants and garden', types: ['plant', 'flowers', 'cactus', 'bamboo', 'tree', 'palm', 'hedge', 'grass', 'fountain'] },
  { id: 'nature', label: 'Water and nature', types: ['pond', 'waterfall', 'sea', 'sand', 'dock', 'boat', 'beachchair', 'umbrella', 'towel', 'sandcastle', 'flowerbed', 'rocks', 'birdbath', 'fountain'] },
  { id: 'floor', label: 'Rugs and mats', types: ['rug', 'mat'] },
  { id: 'decor', label: 'Decor', types: ['lamp', 'balloons', 'frame', 'whiteboard', 'shelf', 'fishtank', 'fireplace', 'piano'] },
  { id: 'info', label: 'Info boards', types: ['valueswall', 'noticeboard', 'wallclock'] },
  { id: 'fun', label: 'Fun', types: ['bike'] },
  { id: 'pets', label: 'Pets', types: ['dog', 'cat'] },
  { id: 'kitchen', label: 'Kitchen and more', types: ['coffee', 'cooler', 'vending', 'bin'] },
];
