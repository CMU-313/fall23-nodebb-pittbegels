import nconf from 'nconf';
import qs from 'querystring';
import { Request, Response, Locals, NextFunction } from 'express';
import { CategoryDataType, UserSettingType } from './category';

import meta from '../meta';
import pagination from '../pagination';
import user from '../user';
import topics from '../topics';
import helpers from './helpers';

interface UnreadRequest extends Request {
    uid: string;
}

interface UnreadDataObject extends CategoryDataType {
    selectedFilter: FilterType;
    filters: FilterType[];
    showCategorySelectLabel: boolean;
    allCategoriesUrl: string;
    topicCount: number;
    pageCount: number;
    selectedCids: string;
	selectedCategory: string;
}

type UnreadCategoryDataType = {
    selectedCids: string,
	selectedCategory: string
}

type FilterType = {
    selected: string,
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const relative_path = nconf.get('relative_path') as string;

// eslint-disable-next-line import/prefer-default-export
export const get = async (req: UnreadRequest, res: Response<object, Locals>) => {
    const { cid } = req.query;
    const filter = req.query.filter || '';
    const webQuery = req.query as qs.ParsedUrlQueryInput;


    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const [categoryData, userSettings, isPrivileged]:
    [UnreadCategoryDataType, UserSettingType, boolean] = await Promise.all([
        helpers.getSelectedCategory(cid),
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        user.getSettings(req.uid),
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        user.isPrivileged(req.uid),
    ]);

    const page = parseInt(req.query.page as string, 10) || 1;
    const start = Math.max(0, (page - 1) * userSettings.topicsPerPage);
    const stop = start + userSettings.topicsPerPage - 1;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    const data: UnreadDataObject = await topics.getUnreadTopics({
        cid: cid,
        uid: req.uid,
        start: start,
        stop: stop,
        filter: filter,
        query: req.query,
    });

    const isDisplayedAsHome = !(req.originalUrl.startsWith(`${relative_path}/api/unread`) || req.originalUrl.startsWith(`${relative_path}/unread`));
    const baseUrl = isDisplayedAsHome ? '' : 'unread';

    if (isDisplayedAsHome) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        data.title = meta.config.homePageTitle || '[[pages:home]]';
    } else {
        data.title = '[[pages:unread]]';
        data.breadcrumbs = helpers.buildBreadcrumbs([{ text: '[[unread:title]]' }]);
    }

    data.pageCount = Math.max(1, Math.ceil(data.topicCount / userSettings.topicsPerPage));
    data.pagination = pagination.create(page, data.pageCount, req.query);
    helpers.addLinkTags({ url: 'unread', res: req.res, tags: data.pagination.rel });

    if (userSettings.usePagination && (page < 1 || page > data.pageCount)) {
        req.query.page = Math.max(1, Math.min(data.pageCount, page)).toString();
        return helpers.redirect(res, `/unread?${qs.stringify(webQuery)}`);
    }
    data.showSelect = true;
    data.showTopicTools = isPrivileged;
    data.allCategoriesUrl = `${baseUrl}${helpers.buildQueryString(req.query, 'cid', '')}`;
    data.selectedCategory = categoryData.selectedCategory;
    data.selectedCids = categoryData.selectedCids;
    data.selectCategoryLabel = '[[unread:mark_as_read]]';
    data.selectedCategory = 'fa-inbox';
    data.showCategorySelectLabel = true;
    data.filters = helpers.buildFilters(baseUrl, filter, req.query);
    data.selectedFilter = data.filters.find(filter => filter && filter.selected);

    data.topics = data.topics.map((topic) => {
        topic.user.isInstructor = topic.user.accounttype === 'instructor';
        return topic;
    });

    res.render('unread', data);
};

export const unreadTotal = async (req: UnreadRequest, res: Response<object, Locals>, next: NextFunction) => {
    const filter = req.query.filter || '';
    try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
        const unreadCount = await topics.getTotalUnread(req.uid, filter);
        res.json(unreadCount as object);
    } catch (err) {
        next(err);
    }
};
