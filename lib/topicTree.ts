// lib/topicTree.ts — Build and query the topic tree from parsed questions

import type { Question } from './types';

export interface TopicNode {
  label: string;
  fullPath: string[];
  slug: string;
  questionNumbers: number[];   // direct questions at exactly this depth
  questionCount: number;       // total (self + all descendants)
  children: TopicNode[];
}

// ─── Slugify ─────────────────────────────────────────────────────────────────

export function slugify(path: string[]): string {
  return path
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// ─── Build topic tree ─────────────────────────────────────────────────────────

export function buildTopicTree(questions: Question[]): TopicNode[] {
  // Use a root-children map approach
  const rootMap = new Map<string, TopicNode>();

  function getOrCreate(parent: Map<string, TopicNode>, path: string[]): TopicNode {
    const key = path.join('|||');
    if (!parent.has(key)) {
      parent.set(key, {
        label: path[path.length - 1],
        fullPath: path,
        slug: slugify(path),
        questionNumbers: [],
        questionCount: 0,
        children: [],
      });
    }
    return parent.get(key)!;
  }

  // We store all nodes by path key for O(1) lookup
  const nodeByKey = new Map<string, TopicNode>();

  for (const q of questions) {
    const path = q.subjectPath;

    // Ensure every ancestor node exists
    for (let depth = 1; depth <= path.length; depth++) {
      const slice = path.slice(0, depth);
      const key = slice.join('|||');
      if (!nodeByKey.has(key)) {
        const node: TopicNode = {
          label: slice[slice.length - 1],
          fullPath: slice,
          slug: slugify(slice),
          questionNumbers: [],
          questionCount: 0,
          children: [],
        };
        nodeByKey.set(key, node);
      }
    }

    // Attribute the question to the leaf node
    const leafKey = path.join('|||');
    nodeByKey.get(leafKey)!.questionNumbers.push(q.number);
  }

  // Wire up parent→child relationships
  for (const [key, node] of nodeByKey) {
    if (node.fullPath.length === 1) {
      // Top-level
      rootMap.set(key, node);
    } else {
      const parentPath = node.fullPath.slice(0, -1);
      const parentKey = parentPath.join('|||');
      const parent = nodeByKey.get(parentKey)!;
      if (!parent.children.find(c => c.slug === node.slug)) {
        parent.children.push(node);
      }
    }
  }

  // Compute questionCount (bottom-up) and sort children alphabetically
  function computeCount(node: TopicNode): number {
    node.questionCount = node.questionNumbers.length;
    for (const child of node.children) {
      node.questionCount += computeCount(child);
    }
    node.children.sort((a, b) => a.label.localeCompare(b.label));
    return node.questionCount;
  }

  const roots = Array.from(rootMap.values()).sort((a, b) => a.label.localeCompare(b.label));
  roots.forEach(computeCount);
  return roots;
}

// ─── Flatten tree to ordered list (for Index page) ───────────────────────────

export interface FlatTopicEntry {
  path: string[];
  slug: string;
  depth: number;
  count: number;
}

export function flattenTopicTree(nodes: TopicNode[], depth = 0): FlatTopicEntry[] {
  const result: FlatTopicEntry[] = [];
  for (const node of nodes) {
    result.push({ path: node.fullPath, slug: node.slug, depth, count: node.questionCount });
    result.push(...flattenTopicTree(node.children, depth + 1));
  }
  return result;
}
