/** Docs of Cluster. */
export const SOLID_SCRIPT_FUNCTION_DOCS_CLUSTER = {
  cluster: {
    usage: 'Cluster(points, distance, groups)',
    summary:
      'Groups points that lie close together, giving each point the index, from 0, of the point its cluster started from, such as Cluster([Points], 0.5). In list order, each point not yet in a cluster starts one, and later points within Distance of that first point join it; Distance is 0.001 when left off. Groups gives a group number per point, so only points of the same group join.',
    group: 'Random',
    gives: ['Number List'],
  },
  cluster_connected: {
    usage: 'ClusterConnected(points, starts, ends, distance)',
    summary:
      "Groups points joined by edges, giving each point the smallest index, from 0, of the points in its cluster, such as ClusterConnected([Box.Vertices.Positions], [Box.Edges.Starts], [Box.Edges.Ends], 0.1). Starts and Ends give the two ends of each edge. In edge order, the clusters at an edge's two ends join when their middles are closer than Distance; a cluster's middle is the average of its points. Distance is 0.001 when left off.",
    group: 'Random',
    gives: ['Number List'],
  },
} as const;

/** Inputs of Cluster and ClusterConnected. */
export const SOLID_SCRIPT_CLUSTER_ARGUMENTS = {
  cluster: {
    points: { type: ['List'], about: 'The points to group, such as [Points].' },
    distance: { type: ['Number'], about: 'How close in metres a point must be to join, such as 0.5.', start: '0.5' },
    groups: { type: ['List'], about: 'A group number for each point, in the same order, such as [1, 1, 2].' },
  },
  cluster_connected: {
    points: { type: ['List'], about: 'The points to group, such as [Box.Vertices.Positions].' },
    starts: {
      type: ['List'],
      about: 'The start of each edge, such as [Box.Edges.Starts].',
      start: '[Box.Edges.Starts]',
    },
    ends: {
      type: ['List'],
      about: 'The end of each edge, in the same order, such as [Box.Edges.Ends].',
      start: '[Box.Edges.Ends]',
    },
    distance: {
      type: ['Number'],
      about: 'How close in metres cluster middles must be to join, such as 0.1.',
      start: '0.1',
    },
  },
} as const;
