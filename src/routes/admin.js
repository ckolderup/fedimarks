import express from 'express';
import { data, domain } from '../util.js';
import { basicUserAuth } from '../basic-auth.js';
import fs from 'fs';
const DATA_PATH = '/app/.data';

export const router = express.Router();

function parseJSON(text) {
  try {
    return JSON.parse(text);
  } catch(e) {
    return null;
  }
}

router.get('/', basicUserAuth, async (req, res) => {
  let params = req.query.raw ? {} : { title: 'Admin'  };
  params.layout = 'admin';
  
  params.bookmarklet = `javascript:(function(){w=window.open('https://${domain}/bookmark/popup?url='+encodeURIComponent(window.location.href)+'&highlight='+encodeURIComponent(window.getSelection().toString()),'fedimarks','scrollbars=yes,width=550,height=600');})();`;

  return res.render("admin", params);
});

router.get('/bookmarks', basicUserAuth, async (req, res) => {
  let params = req.query.raw ? {} : { title: 'Admin: Import bookmarks'  };
  params.layout = 'admin';
  
  return res.render("admin/bookmarks", params)
});

router.get('/followers', basicUserAuth, async (req, res) => {
  let params = req.query.raw ? {} : { title: 'Admin: Permissions & followers'  };
  params.layout = 'admin';
  
  const apDb = req.app.get('apDb');  
  
  const permissions = await apDb.getGlobalPermissions();

  try {
    const followers = await apDb.getFollowers();
    params.followers = JSON.parse(followers || '[]');
  } catch (e) {
    console.log("Error fetching followers for admin page");
  }
  
  try {
    const blocks = await apDb.getBlocks();
    params.blocks = JSON.parse(blocks || '[]');
  } catch (e) {
    console.log("Error fetching blocks for admin page");
  }
  
  params.allowed = permissions?.allowed || "";
  params.blocked = permissions?.blocked || "";
  
  return res.render("admin/followers", params);
});

router.get('/data', basicUserAuth, async (req, res) => {
  let params = req.query.raw ? {} : { title: 'Admin: Data export'  };
  params.layout = 'admin';
  
  return res.render("admin/data", params);
});

router.get("/bookmarks.db", basicUserAuth, async (req, res) => {
  const filePath = `${DATA_PATH}/bookmarks.db`;

  res.setHeader('Content-Type', 'application/vnd.sqlite3');
  res.setHeader('Content-Disposition', 'attachment; filename="bookmarks.db"');

  res.download(filePath)
});

router.get("/activitypub.db", basicUserAuth, async (req, res) => {
  const filePath = `${DATA_PATH}/activitypub.db`;

  res.setHeader('Content-Type', 'application/vnd.sqlite3');
  res.setHeader('Content-Disposition', 'attachment; filename="activitypub.db"');

  res.download(filePath)
});

router.post("/followers/block", basicUserAuth, async (req, res) => {
  let db = req.app.get('apDb');
  
  const oldFollowersText = await db.getFollowers() || '[]';
  
  // update followers
  let followers = parseJSON(oldFollowersText);
  if (followers) {
    followers.forEach((follower, idx, followers) => {
      if (follower === req.body.actor) {
        followers.splice(idx, 1);
      }
    });
  }
    
  let newFollowersText = JSON.stringify(followers);

  try {
    const updatedFollowers = await db.setFollowers(newFollowersText);
  } catch (e) {
    console.log('error storing followers after unfollow', e);
  }
  
  const oldBlocksText = await db.getBlocks() || '[]';
  
  let blocks = parseJSON(oldBlocksText);

  if (blocks) {
    blocks.push(req.body.actor);
    // unique items
    blocks = [...new Set(blocks)];
  }
  else {
    blocks = [req.body.actor];
  }
  let newBlocksText = JSON.stringify(blocks);
  try {
    // update into DB
    const newBlocks = await db.setBlocks(newBlocksText);

    console.log('updated blocks!');
  }
  catch(e) {
    console.log('error storing blocks after block action', e);
  }
  
  res.redirect("/admin/followers");
});

router.post("/followers/unblock", basicUserAuth, async (req, res) => {
  let db = req.app.get('apDb');

  const oldBlocksText = await db.getBlocks() || '[]';

  let blocks = parseJSON(oldBlocksText);
  if (blocks) {
    blocks.forEach((block, idx, blocks) => {
      if (block === req.body.actor) {
        blocks.splice(idx, 1);
      }
    });
  }

  let newBlocksText = JSON.stringify(blocks);

  try {
    const updatedBlocks = await db.setBlocks(newBlocksText);
  } catch (e) {
    console.log('error storing blocks after unblock action', e);
  }
  
  res.redirect("/admin/followers");
});

router.post("/permissions", basicUserAuth, async (req, res) => {
  const apDb = req.app.get('apDb');

  await apDb.setGlobalPermissions(req.body.allowed, req.body.blocked);

  res.redirect("/admin");
});

router.post("/reset", basicUserAuth, async (req, res) => {
  const db = req.app.get('bookmarksDb');

  await db.deleteAllBookmarks();
res.redirect("/admin");
});
