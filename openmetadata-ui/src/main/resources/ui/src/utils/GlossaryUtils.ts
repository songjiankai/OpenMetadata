/*
 *  Copyright 2022 Collate.
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *  http://www.apache.org/licenses/LICENSE-2.0
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

import { AxiosError } from 'axios';
import { isUndefined, omit } from 'lodash';
import { StatusType } from '../components/common/StatusBadge/StatusBadge.interface';
import { ModifiedGlossaryTerm } from '../components/Glossary/GlossaryTermTab/GlossaryTermTab.interface';
import {
  FQN_SEPARATOR_CHAR,
  WILD_CARD_CHAR,
} from '../constants/char.constants';
import { SearchIndex } from '../enums/search.enum';
import { Glossary } from '../generated/entity/data/glossary';
import { GlossaryTerm, Status } from '../generated/entity/data/glossaryTerm';
import { EntityReference } from '../generated/type/entityReference';
import { SearchResponse } from '../interface/search.interface';
import { ListGlossaryTermsParams } from '../rest/glossaryAPI';
import { searchData } from '../rest/miscAPI';
import { formatSearchGlossaryTermResponse } from './APIUtils';
import Fqn from './Fqn';
import { getGlossaryPath } from './RouterUtils';

export interface GlossaryTermTreeNode {
  children?: GlossaryTermTreeNode[];
  fullyQualifiedName: string;
  name: string;
}

/**
 * To get all glossary terms
 * @returns promise of list of formatted glossary terms
 */
export const fetchGlossaryTerms = (): Promise<GlossaryTerm[]> => {
  return new Promise<GlossaryTerm[]>((resolve, reject) => {
    searchData(WILD_CARD_CHAR, 1, 1000, '', '', '', SearchIndex.GLOSSARY)
      .then((res) => {
        const data = formatSearchGlossaryTermResponse(
          (res?.data as SearchResponse<SearchIndex.GLOSSARY>)?.hits?.hits || []
        );
        resolve(data);
      })
      .catch((error: AxiosError) => reject(error.response));
  });
};

/**
 * To get list of fqns from list of glossary terms
 * @param terms formatted glossary terms
 * @returns list of term fqns
 */
export const getGlossaryTermlist = (
  terms: Array<GlossaryTerm> = []
): Array<string> => {
  return terms.map((term: GlossaryTerm) => term.fullyQualifiedName || '');
};

export const getEntityReferenceFromGlossary = (
  glossary: Glossary
): EntityReference => {
  return {
    deleted: glossary.deleted,
    href: glossary.href,
    fullyQualifiedName: glossary.fullyQualifiedName ?? '',
    id: glossary.id,
    type: 'glossaryTerm',
    description: glossary.description,
    displayName: glossary.displayName,
    name: glossary.name,
  };
};

export const getEntityReferenceFromGlossaryTerm = (
  glossaryTerm: GlossaryTerm
): EntityReference => {
  return {
    deleted: glossaryTerm.deleted,
    href: glossaryTerm.href,
    fullyQualifiedName: glossaryTerm.fullyQualifiedName ?? '',
    id: glossaryTerm.id,
    type: 'glossaryTerm',
    description: glossaryTerm.description,
    displayName: glossaryTerm.displayName,
    name: glossaryTerm.name,
  };
};

// calculate root level glossary term
export const getRootLevelGlossaryTerm = (
  data: GlossaryTerm[],
  params?: ListGlossaryTermsParams
) => {
  return data.reduce((glossaryTerms, curr) => {
    const currentTerm =
      curr.children?.length === 0 ? omit(curr, 'children') : curr;
    if (params?.glossary) {
      return isUndefined(curr.parent)
        ? [...glossaryTerms, currentTerm]
        : glossaryTerms;
    }

    return curr?.parent?.id === params?.parent
      ? [...glossaryTerms, currentTerm]
      : glossaryTerms;
  }, [] as GlossaryTerm[]);
};

export const buildTree = (data: GlossaryTerm[]): GlossaryTerm[] => {
  const nodes: Record<string, GlossaryTerm> = {};

  // Create nodes first
  data.forEach((obj) => {
    nodes[obj.fullyQualifiedName ?? ''] = {
      ...obj,
      children: obj.children?.length ? [] : undefined,
    };
  });

  // Build the tree structure
  const tree: GlossaryTerm[] = [];
  data.forEach((obj) => {
    const current = nodes[obj.fullyQualifiedName ?? ''];
    const parent = nodes[obj.parent?.fullyQualifiedName || ''];

    if (parent && parent.children) {
      // converting glossaryTerm to EntityReference
      parent.children.push({ ...current, type: 'glossaryTerm' });
    } else {
      tree.push(current);
    }
  });

  return tree;
};

// update glossaryTerm tree with newly fetch child term
export const createGlossaryTermTree = (
  glossaryTerms: ModifiedGlossaryTerm[],
  updatedData: GlossaryTerm[],
  glossaryTermId?: string
) => {
  return glossaryTerms.map((term) => {
    if (term.id === glossaryTermId) {
      term.children = updatedData;
    } else if (term?.children?.length) {
      createGlossaryTermTree(
        term.children as ModifiedGlossaryTerm[],
        updatedData,
        glossaryTermId
      );
    }

    return term;
  });
};

// Calculate searched data based on search value
export const getSearchedDataFromGlossaryTree = (
  glossaryTerms: ModifiedGlossaryTerm[],
  value: string
): ModifiedGlossaryTerm[] => {
  return glossaryTerms.reduce((acc, term) => {
    const isMatching =
      term.name.toLowerCase().includes(value.toLowerCase()) ||
      term?.displayName?.toLowerCase().includes(value.toLowerCase());

    if (isMatching) {
      return [...acc, term];
    } else if (term.children?.length) {
      const children = getSearchedDataFromGlossaryTree(
        term.children as ModifiedGlossaryTerm[],
        value
      );
      if (children.length) {
        return [...acc, { ...term, children: children as GlossaryTerm[] }];
      }
    }

    return acc;
  }, [] as ModifiedGlossaryTerm[]);
};

export const getQueryFilterToExcludeTerm = (fqn: string) => ({
  query: {
    bool: {
      must: [
        {
          bool: {
            must: [
              {
                bool: {
                  must_not: {
                    term: {
                      'tags.tagFQN': fqn,
                    },
                  },
                },
              },
            ],
          },
        },
      ],
    },
  },
});

export const formatRelatedTermOptions = (
  data: EntityReference[] | undefined
) => {
  return data
    ? data.map((value) => ({
        ...value,
        value: value.id,
        label: value.displayName || value.name,
        key: value.id,
      }))
    : [];
};

export const StatusClass = {
  [Status.Approved]: StatusType.Success,
  [Status.Draft]: StatusType.Warning,
  [Status.Rejected]: StatusType.Failure,
  [Status.Deprecated]: StatusType.Warning,
};

export const StatusFilters = Object.values(Status)
  .filter((status) => status !== Status.Deprecated) // Deprecated not in use for this release
  .map((status) => ({
    text: status,
    value: status,
  }));

export const getGlossaryBreadcrumbs = (fqn: string) => {
  const arr = Fqn.split(fqn);
  const dataFQN: Array<string> = [];
  const breadcrumbList = [
    {
      name: 'Glossaries',
      url: getGlossaryPath(''),
      activeTitle: false,
    },
    ...arr.map((d) => {
      dataFQN.push(d);

      return {
        name: d,
        url: getGlossaryPath(dataFQN.join(FQN_SEPARATOR_CHAR)),
        activeTitle: false,
      };
    }),
  ];

  return breadcrumbList;
};
