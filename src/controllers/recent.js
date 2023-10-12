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
exports.get = exports.getData = void 0;
const nconf_1 = __importDefault(require("nconf"));
const user_1 = __importDefault(require("../user"));
const categories_1 = __importDefault(require("../categories"));
const topics_1 = __importDefault(require("../topics"));
const meta_1 = __importDefault(require("../meta"));
const helpers_1 = __importDefault(require("./helpers"));
const pagination_1 = __importDefault(require("../pagination"));
const privileges_1 = __importDefault(require("../privileges"));
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const relative_path = nconf_1.default.get('relative_path');
const canPostTopic = (uid) => __awaiter(void 0, void 0, void 0, function* () {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    let cids = yield categories_1.default.getAllCidsFromSet('categories:cid');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    cids = yield privileges_1.default.categories.filterCids('topics:create', cids, uid);
    return cids.length > 0;
});
const getData = (req, url, sort) => __awaiter(void 0, void 0, void 0, function* () {
    const { originalUrl, loggedIn, query, uid, res } = req;
    const { cid, tags } = query;
    const page = parseInt(query.page, 10) || 1;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    let term = helpers_1.default.terms[query.term];
    const filter = query.filter || '';
    if (!term && query.term) {
        return null;
    }
    term = term || 'alltime';
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const [settings, categoryData, rssToken, canPost, isPrivileged] = yield Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        user_1.default.getSettings(uid),
        helpers_1.default.getSelectedCategory(cid),
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        user_1.default.auth.getFeedToken(uid),
        canPostTopic(uid),
        user_1.default.isPrivileged(uid),
    ]);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const start = Math.max(0, (page - 1) * settings.topicsPerPage);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const stop = start + settings.topicsPerPage - 1;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    const data = yield topics_1.default.getSortedTopics({
        cids: cid,
        tags: tags,
        uid: uid,
        start: start,
        stop: stop,
        filter: filter,
        term: term,
        sort: sort,
        floatPinned: query.pinned,
        query: query,
    });
    const isDisplayedAsHome = !(originalUrl.startsWith(`${relative_path}/api/${url}`) || originalUrl.startsWith(`${relative_path}/${url}`));
    const baseUrl = isDisplayedAsHome ? '' : url;
    if (isDisplayedAsHome) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        data.title = meta_1.default.config.homePageTitle || '[[pages:home]]';
    }
    else {
        data.title = `[[pages:${url}]]`;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data.breadcrumbs = helpers_1.default.buildBreadcrumbs([{ text: `[[${url}:title]]` }]);
    }
    data.canPost = canPost;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    data.showSelect = isPrivileged;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    data.showTopicTools = isPrivileged;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    data.allCategoriesUrl = baseUrl + helpers_1.default.buildQueryString(query, 'cid', '');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
    data.selectedCategory = categoryData.selectedCategory;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
    data.selectedCids = categoryData.selectedCids;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
    data['feeds:disableRSS'] = meta_1.default.config['feeds:disableRSS'] || 0;
    data.rssFeedUrl = `${relative_path}/${url}.rss`;
    if (loggedIn) {
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        data.rssFeedUrl += `?uid=${uid}&token=${rssToken}`;
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    data.filters = helpers_1.default.buildFilters(baseUrl, filter, query);
    data.selectedFilter = data.filters.find(filter => filter && filter.selected);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    data.terms = helpers_1.default.buildTerms(baseUrl, term, query);
    data.selectedTerm = data.terms.find(term => term && term.selected);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const pageCount = Math.max(1, Math.ceil(data.topicCount / settings.topicsPerPage));
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    data.pagination = pagination_1.default.create(page, pageCount, query);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    helpers_1.default.addLinkTags({ url: url, res: res, tags: data.pagination.rel });
    return data;
});
exports.getData = getData;
const get = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    const data = yield (0, exports.getData)(req, 'recent', 'recent');
    if (!data) {
        return next();
    }
    data.topics = data.topics.map((topic) => {
        topic.user.isInstructor = topic.user.accounttype === 'instructor';
        return topic;
    });
    res.render('recent', data);
});
exports.get = get;
