/** Docs of Cluster. */
export const SOLID_SCRIPT_FUNCTION_DOCS_CLUSTER = {
  cluster: {
    usage: 'Cluster(points, distance, groups)',
    summary:
      'Groups points that lie close together, giving each point the index, from 0, of the point its cluster started from, such as Cluster([Points], 0.5). In list order, each point not yet in a cluster starts one, and later points within Distance of that first point join it; Distance is 0.001 when left off. Groups gives a group number per point, so only points of the same group join.',
    group: 'Random',
    gives: ['Number List'],
  },
} as const;

/** Inputs of Cluster. */
export const SOLID_SCRIPT_CLUSTER_ARGUMENTS = {
  cluster: {
    points: { type: ['List'], about: 'The points to group, such as [Points].' },
    distance: { type: ['Number'], about: 'How close in metres a point must be to join, such as 0.5.', start: '0.5' },
    groups: { type: ['List'], about: 'A group number for each point, in the same order, such as [1, 1, 2].' },
  },
} as const;
