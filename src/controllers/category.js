"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.get = void 0;
const nconf_1 = __importDefault(require("nconf"));
const validator_1 = __importDefault(require("validator"));
const querystring_1 = __importDefault(require("querystring"));
const database_1 = __importDefault(require("../database"));
const privileges_1 = __importDefault(require("../privileges"));
const user_1 = __importDefault(require("../user"));
const categories_1 = __importDefault(require("../categories"));
const meta_1 = __importDefault(require("../meta"));
const pagination_1 = __importDefault(require("../pagination"));
const helpers_1 = __importDefault(require("./helpers"));
const utils_1 = __importDefault(require("../utils"));
const translator_1 = __importDefault(require("../translator"));
const analytics_1 = __importDefault(require("../analytics"));
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const url = nconf_1.default.get('url');
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const relative_path = nconf_1.default.get('relative_path');
function buildBreadcrumbs(req, categoryData) {
    return __awaiter(this, void 0, void 0, function* () {
        const breadcrumbs = [
            {
                text: categoryData.name,
                url: `${relative_path}/category/${categoryData.slug}`,
                cid: categoryData.cid,
            },
        ];
        const crumbs = yield helpers_1.default.buildCategoryBreadcrumbs(categoryData.parentCid);
        if (req.originalUrl.startsWith(`${relative_path}/api/category`) || req.originalUrl.startsWith(`${relative_path}/category`)) {
            categoryData.breadcrumbs = crumbs.concat(breadcrumbs);
        }
    });
}
function addTags(categoryData, res) {
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
const get = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    const cid = req.params.category_id;
    const webQuery = req.query;
    let currentPage = parseInt(req.query.page, 10) || 1;
    let topicIndex = utils_1.default.isNumber(req.params.topic_index) ? parseInt(req.params.topic_index, 10) - 1 : 0;
    if ((req.params.topic_index && !utils_1.default.isNumber(req.params.topic_index)) || !utils_1.default.isNumber(cid)) {
        return next();
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const [categoryFields, userPrivileges, userSettings, rssToken] = yield Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        categories_1.default.getCategoryFields(cid, ['slug', 'disabled', 'link']),
        privileges_1.default.categories.get(cid, req.uid),
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        user_1.default.getSettings(req.uid),
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        user_1.default.auth.getFeedToken(req.uid),
    ]);
    if (!categoryFields.slug ||
        (categoryFields && categoryFields.disabled) ||
        (userSettings.usePagination && currentPage < 1)) {
        return next();
    }
    if (topicIndex < 0) {
        return helpers_1.default.redirect(res, `/category/${categoryFields.slug}?${querystring_1.default.stringify(webQuery)}`);
    }
    if (!userPrivileges.read) {
        return helpers_1.default.notAllowed(req, res);
    }
    if (!res.locals.isAPI && !req.params.slug && (categoryFields.slug && categoryFields.slug !== `${cid}/`)) {
        return helpers_1.default.redirect(res, `/category/${categoryFields.slug}?${querystring_1.default.stringify(webQuery)}`, true);
    }
    if (categoryFields.link) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        yield database_1.default.incrObjectField(`category:${cid}`, 'timesClicked');
        return helpers_1.default.redirect(res, validator_1.default.unescape(categoryFields.link));
    }
    if (!userSettings.usePagination) {
        topicIndex = Math.max(0, topicIndex - (Math.ceil(userSettings.topicsPerPage / 2) - 1));
    }
    else if (!req.query.page) {
        const index = Math.max(topicIndex, 0);
        currentPage = Math.ceil((index + 1) / userSettings.topicsPerPage);
        topicIndex = 0;
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const targetUid = yield user_1.default.getUidByUserslug(req.query.author);
    const start = ((currentPage - 1) * userSettings.topicsPerPage) + topicIndex;
    const stop = start + userSettings.topicsPerPage - 1;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const categoryData = yield categories_1.default.getCategoryById({
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
        return helpers_1.default.redirect(res, `/category/${categoryData.slug}/${categoryData.topic_count}?${querystring_1.default.stringify(webQuery)}`);
    }
    const pageCount = Math.max(1, Math.ceil(categoryData.topic_count / userSettings.topicsPerPage));
    if (userSettings.usePagination && currentPage > pageCount) {
        return next();
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    categories_1.default.modifyTopicsByPrivilege(categoryData.topics, userPrivileges);
    categoryData.tagWhitelist =
        categories_1.default.filterTagWhitelist(categoryData.tagWhitelist, userPrivileges.isAdminOrMod);
    yield buildBreadcrumbs(req, categoryData);
    if (categoryData.children.length) {
        const allCategories = [];
        categories_1.default.flattenCategories(allCategories, categoryData.children);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        yield categories_1.default.getRecentTopicReplies(allCategories, req.uid, req.query);
        categoryData.subCategoriesLeft = Math.max(0, categoryData.children.length - categoryData.subCategoriesPerPage);
        categoryData.hasMoreSubCategories = categoryData.children.length > categoryData.subCategoriesPerPage;
        categoryData.nextSubCategoryStart = categoryData.subCategoriesPerPage;
        categoryData.children = categoryData.children.slice(0, categoryData.subCategoriesPerPage);
        categoryData.children.forEach((child) => {
            if (child) {
                helpers_1.default.trimChildren(child);
                helpers_1.default.setCategoryTeaser(child);
            }
        });
    }
    categoryData.title = translator_1.default.escape(categoryData.name);
    categoryData.selectCategoryLabel = '[[category:subcategories]]';
    categoryData.description = translator_1.default.escape(categoryData.description);
    categoryData.privileges = userPrivileges;
    categoryData.showSelect = userPrivileges.editable;
    categoryData.showTopicTools = userPrivileges.editable;
    categoryData.topicIndex = topicIndex;
    categoryData.rssFeedUrl = `${url}/category/${categoryData.cid}.rss`;
    if (parseInt(req.uid, 10)) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        categories_1.default.markAsRead([cid], req.uid);
        categoryData.rssFeedUrl += `?uid=${req.uid}&token=${rssToken}`;
    }
    addTags(categoryData, res);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    categoryData['feeds:disableRSS'] = meta_1.default.config['feeds:disableRSS'] || 0;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    categoryData['reputation:disabled'] = meta_1.default.config['reputation:disabled'];
    categoryData.pagination = pagination_1.default.create(currentPage, pageCount, req.query);
    categoryData.pagination.rel.forEach((rel) => {
        rel.href = `${url}/category/${categoryData.slug}${rel.href}`;
        res.locals.linkTags.push(rel);
    });
    analytics_1.default.increment([`pageviews:byCid:${categoryData.cid}`]);
    categoryData.topics = categoryData.topics.map((topic) => {
        topic.user.isInstructor = topic.user.accounttype === 'instructor';
        return topic;
    });
    res.render('category', categoryData);
});
exports.get = get;
