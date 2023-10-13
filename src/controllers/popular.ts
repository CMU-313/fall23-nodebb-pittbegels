import nconf from 'nconf';
import validator from 'validator';
import { Locals, NextFunction, Response } from 'express';

import helpers from './helpers';
import { getData, RecentDataType, RecentRequest } from './recent';

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const relative_path: string = nconf.get('relative_path');

// eslint-disable-next-line import/prefer-default-export
export const get = async (req: RecentRequest, res: Response<object, Locals>, next: NextFunction) => {
    const data: RecentDataType = await getData(req, 'popular', 'posts');
    if (!data) {
        return next();
    }
    const term = (helpers.terms[req.query.term] as string) || 'alltime';
    if (req.originalUrl.startsWith(`${relative_path}/api/popular`) || req.originalUrl.startsWith(`${relative_path}/popular`)) {
        data.title = `[[pages:popular-${term}]]`;
        const breadcrumbs = [{ text: '[[global:header.popular]]' }];
        data.breadcrumbs = helpers.buildBreadcrumbs(breadcrumbs);
    }

    const feedQs = data.rssFeedUrl.split('?')[1];
    data.rssFeedUrl = `${relative_path}/popular/${validator.escape(String(req.query.term || 'alltime'))}.rss`;
    if (req.loggedIn) {
        data.rssFeedUrl += `?${feedQs}`;
    }

    data.topics = data.topics.map((topic) => {
        topic.user.isInstructor = topic.user.accounttype === 'instructor';
        return topic;
    });

    res.render('popular', data);
};
