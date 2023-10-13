import nconf from 'nconf';
import validator from 'validator';
import qs from 'querystring';
import { Request, Response, Locals, NextFunction } from 'express';
import { Breadcrumbs, Pagination, TopicObject, CategoryObject } from '../types';

import db from '../database';
import privileges from '../privileges';
import user from '../user';
import categories from '../categories';
import meta from '../meta';
import pagination from '../pagination';
import helpers from './helpers';
import utils from '../utils';
import translator from '../translator';
import analytics from '../analytics';

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const url: string = nconf.get('url');
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const relative_path: string = nconf.get('relative_path');

interface CategoryRequest extends Request {
    uid: string;
}

interface CategoryLocals extends Locals {
    isAPI: boolean;
    metaTags: MetaTagType[];
    linkTags: LinkTagType[];
}

export type CategoryFieldsType = {
    slug: string,
    disabled: boolean,
    link: string
};

export type PrivilegesType = {
    read: boolean,
    isAdminOrMod: boolean,
    editable: boolean
}

export type UserSettingType = {
    topicsPerPage: number,
    usePagination: boolean,
    categoryTopicSort: string,
}

type MetaTagType = {
    name?: string,
    property?: string,
    content: string,
    noEscape?: boolean
}

type LinkTagType = {
    rel: string,
    href: string,
    type?: string
}

export interface CategoryDataType extends CategoryObject {
    pagination: Pagination;
    breadcrumbs: Breadcrumbs;
    backgroundImage: string;
    rssFeedUrl: string;
    topicIndex: number;
    showTopicTools: boolean;
    showSelect: boolean;
    privileges: PrivilegesType;
    selectCategoryLabel: string;
    title: string;
    nextSubCategoryStart: number;
    hasMoreSubCategories: boolean;
    subCategoriesLeft: number;
    children: CategoryObject[];
    tagWhitelist: string[];
    topics: TopicObject[];
}

async function buildBreadcrumbs(req: CategoryRequest, categoryData: CategoryDataType) {
    const breadcrumbs = [
        {
            text: categoryData.name,
            url: `${relative_path}/category/${categoryData.slug}`,
            cid: categoryData.cid,
        },
    ];
    const crumbs = await helpers.buildCategoryBreadcrumbs(categoryData.parentCid);
    if (req.originalUrl.startsWith(`${relative_path}/api/category`) || req.originalUrl.startsWith(`${relative_path}/category`)) {
        categoryData.breadcrumbs = crumbs.concat(breadcrumbs);
    }
}

function addTags(categoryData: CategoryDataType, res: Response<object, CategoryLocals>) {
    res.locals.metaTags = [
        {
            name: 'title',
            content: categoryData.name,
            noEscape: true,
        },
        {
            property: 'og:title',
            content: categoryData.name,
            noEscape: true,
        },
        {
            name: 'description',
            content: categoryData.description,
            noEscape: true,
        },
        {
            property: 'og:type',
            content: 'website',
        },
    ];

    if (categoryData.backgroundImage) {
        if (!categoryData.backgroundImage.startsWith('http')) {
            categoryData.backgroundImage = url + categoryData.backgroundImage;
        }
        res.locals.metaTags.push({
            property: 'og:image',
            content: categoryData.backgroundImage,
        });
    }

    res.locals.linkTags = [
        {
            rel: 'up',
            href: url,
        },
    ];

    if (!categoryData['feeds:disableRSS']) {
        res.locals.linkTags.push({
            rel: 'alternate',
            type: 'application/rss+xml',
            href: categoryData.rssFeedUrl,
        });
    }
}

// eslint-disable-next-line import/prefer-default-export
export const get = async (
    req: CategoryRequest,
    res: Response<object, CategoryLocals>,
    next: NextFunction
): Promise<void> => {
    const cid = req.params.category_id;
    const webQuery = req.query as qs.ParsedUrlQueryInput;

    let currentPage: number = parseInt(req.query.page as string, 10) || 1;
    let topicIndex: number = utils.isNumber(req.params.topic_index) ? parseInt(req.params.topic_index, 10) - 1 : 0;
    if ((req.params.topic_index && !utils.isNumber(req.params.topic_index)) || !utils.isNumber(cid)) {
        return next();
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const [categoryFields, userPrivileges, userSettings, rssToken]:
    [CategoryFieldsType, PrivilegesType, UserSettingType, string] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        categories.getCategoryFields(cid, ['slug', 'disabled', 'link']),
        privileges.categories.get(cid, req.uid),
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        user.getSettings(req.uid),
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        user.auth.getFeedToken(req.uid),
    ]);

    if (!categoryFields.slug ||
        (categoryFields && categoryFields.disabled) ||
        (userSettings.usePagination && currentPage < 1)) {
        return next();
    }
    if (topicIndex < 0) {
        return helpers.redirect(res, `/category/${categoryFields.slug}?${qs.stringify(webQuery)}`);
    }

    if (!userPrivileges.read) {
        return helpers.notAllowed(req, res);
    }
    if (!res.locals.isAPI && !req.params.slug && (categoryFields.slug && categoryFields.slug !== `${cid}/`)) {
        return helpers.redirect(res, `/category/${categoryFields.slug}?${qs.stringify(webQuery)}`, true);
    }
    if (categoryFields.link) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        await db.incrObjectField(`category:${cid}`, 'timesClicked');
        return helpers.redirect(res, validator.unescape(categoryFields.link));
    }

    if (!userSettings.usePagination) {
        topicIndex = Math.max(0, topicIndex - (Math.ceil(userSettings.topicsPerPage / 2) - 1));
    } else if (!req.query.page) {
        const index = Math.max(topicIndex, 0);
        currentPage = Math.ceil((index + 1) / userSettings.topicsPerPage);
        topicIndex = 0;
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const targetUid = await user.getUidByUserslug(req.query.author) as string;
    const start = ((currentPage - 1) * userSettings.topicsPerPage) + topicIndex;
    const stop = start + userSettings.topicsPerPage - 1;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const categoryData: CategoryDataType = await categories.getCategoryById({
        uid: req.uid,
        cid: cid,
        start: start,
        stop: stop,
        sort: req.query.sort || userSettings.categoryTopicSort,
        settings: userSettings,
        query: req.query,
        tag: req.query.tag,
        targetUid: targetUid,
    });
    if (!categoryData) {
        return next();
    }

    if (topicIndex > Math.max(categoryData.topic_count - 1, 0)) {
        return helpers.redirect(res, `/category/${categoryData.slug}/${categoryData.topic_count}?${qs.stringify(webQuery)}`);
    }
    const pageCount = Math.max(1, Math.ceil(categoryData.topic_count / userSettings.topicsPerPage));
    if (userSettings.usePagination && currentPage > pageCount) {
        return next();
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    categories.modifyTopicsByPrivilege(categoryData.topics, userPrivileges);
    categoryData.tagWhitelist =
        categories.filterTagWhitelist(categoryData.tagWhitelist, userPrivileges.isAdminOrMod) as string[];

    await buildBreadcrumbs(req, categoryData);
    if (categoryData.children.length) {
        const allCategories = [];
        categories.flattenCategories(allCategories, categoryData.children);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        await categories.getRecentTopicReplies(allCategories, req.uid, req.query);
        categoryData.subCategoriesLeft = Math.max(0, categoryData.children.length - categoryData.subCategoriesPerPage);
        categoryData.hasMoreSubCategories = categoryData.children.length > categoryData.subCategoriesPerPage;
        categoryData.nextSubCategoryStart = categoryData.subCategoriesPerPage;
        categoryData.children = categoryData.children.slice(0, categoryData.subCategoriesPerPage);
        categoryData.children.forEach((child) => {
            if (child) {
                helpers.trimChildren(child);
                helpers.setCategoryTeaser(child);
            }
        });
    }

    categoryData.title = translator.escape(categoryData.name);
    categoryData.selectCategoryLabel = '[[category:subcategories]]';
    categoryData.description = translator.escape(categoryData.description);
    categoryData.privileges = userPrivileges;
    categoryData.showSelect = userPrivileges.editable;
    categoryData.showTopicTools = userPrivileges.editable;
    categoryData.topicIndex = topicIndex;
    categoryData.rssFeedUrl = `${url}/category/${categoryData.cid}.rss`;
    if (parseInt(req.uid, 10)) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        categories.markAsRead([cid], req.uid);
        categoryData.rssFeedUrl += `?uid=${req.uid}&token=${rssToken}`;
    }

    addTags(categoryData, res);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    categoryData['feeds:disableRSS'] = (meta.config['feeds:disableRSS'] as number) || 0;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    categoryData['reputation:disabled'] = meta.config['reputation:disabled'] as number;
    categoryData.pagination = pagination.create(currentPage, pageCount, req.query);
    categoryData.pagination.rel.forEach((rel) => {
        rel.href = `${url}/category/${categoryData.slug}${rel.href}`;
        res.locals.linkTags.push(rel);
    });

    analytics.increment([`pageviews:byCid:${categoryData.cid}`]);

    categoryData.topics = categoryData.topics.map((topic) => {
        topic.user.isInstructor = topic.user.accounttype === 'instructor';
        return topic;
    });

    res.render('category', categoryData);
};
