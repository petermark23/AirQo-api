const express = require("express");
const router = express.Router();
const createPermissionController = require("@controllers/create-permission");
const { check, oneOf, query, body, param } = require("express-validator");

const { setJWTAuth, authJWT } = require("@middleware/passport");

const mongoose = require("mongoose");
const ObjectId = mongoose.Types.ObjectId;

const headers = (req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization"
  );
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
  next();
};
router.use(headers);

router.get(
  "/:permission_id",
  oneOf([
    [
      query("tenant")
        .optional()
        .notEmpty()
        .withMessage("tenant should not be empty if provided")
        .trim()
        .toLowerCase()
        .bail()
        .isIn(["kcca", "airqo"])
        .withMessage("the tenant value is not among the expected ones"),
    ],
  ]),
  setJWTAuth,
  authJWT,
  createPermissionController.list
);

router.post(
  "/",
  oneOf([
    [
      query("tenant")
        .optional()
        .notEmpty()
        .withMessage("tenant should not be empty if provided")
        .trim()
        .toLowerCase()
        .bail()
        .isIn(["kcca", "airqo"])
        .withMessage("the tenant value is not among the expected ones"),
    ],
  ]),
  oneOf([
    [
      body("permission")
        .exists()
        .withMessage("permission is missing in your request")
        .bail()
        .notEmpty()
        .withMessage("the permission must not be empty")
        .bail()
        .trim()
        .escape()
        .customSanitizer((value) => {
          return value.replace(/ /g, "_").toUpperCase();
        }),
      body("network_id")
        .optional()
        .notEmpty()
        .withMessage("network_id should not be empty if provided")
        .bail()
        .trim()
        .isMongoId()
        .withMessage("network_id must be an object ID")
        .bail()
        .customSanitizer((value) => {
          return ObjectId(value);
        }),
      body("description")
        .exists()
        .withMessage("description is missing in your request")
        .bail()
        .notEmpty()
        .withMessage("the description must not be empty")
        .trim(),
    ],
  ]),
  setJWTAuth,
  authJWT,
  createPermissionController.create
);

router.put(
  "/:permission_id",
  oneOf([
    [
      query("tenant")
        .optional()
        .notEmpty()
        .withMessage("tenant should not be empty if provided")
        .trim()
        .toLowerCase()
        .bail()
        .isIn(["kcca", "airqo"])
        .withMessage("the tenant value is not among the expected ones"),
    ],
  ]),
  setJWTAuth,
  authJWT,
  createPermissionController.update
);

router.delete(
  "/:permission_id",
  oneOf([
    [
      query("tenant")
        .optional()
        .notEmpty()
        .withMessage("tenant should not be empty if provided")
        .trim()
        .toLowerCase()
        .bail()
        .isIn(["kcca", "airqo"])
        .withMessage("the tenant value is not among the expected ones"),
    ],
  ]),
  setJWTAuth,
  authJWT,
  createPermissionController.delete
);

module.exports = router;
