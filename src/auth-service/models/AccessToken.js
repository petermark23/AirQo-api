const mongoose = require("mongoose").set("debug", true);
const { logObject, logElement, logText } = require("../utils/log");
const ObjectId = mongoose.Schema.Types.ObjectId;
const isEmpty = require("is-empty");
const HTTPStatus = require("http-status");

/**
 * belongs to a user
 * a User has many access tokens
 */

const AccessTokenSchema = new mongoose.Schema(
  {
    userId: { type: ObjectId },
    name: { type: String },
    token: { type: String, unique: true },
    last_used_at: { type: Date },
    last_ip_address: { type: Date },
  },
  { timestamps: true }
);

AccessTokenSchema.pre("save", function (next) {
  return next();
});

AccessTokenSchema.pre("findOneAndUpdate", function () {
  let that = this;
  const update = that.getUpdate();
  if (update.__v != null) {
    delete update.__v;
  }
  const keys = ["$set", "$setOnInsert"];
  for (const key of keys) {
    if (update[key] != null && update[key].__v != null) {
      delete update[key].__v;
      if (Object.keys(update[key]).length === 0) {
        delete update[key];
      }
    }
  }
  update.$inc = update.$inc || {};
  update.$inc.__v = 1;
});

AccessTokenSchema.pre("update", function (next) {
  return next();
});

AccessTokenSchema.index({ email: 1 }, { unique: true });
AccessTokenSchema.index({ userName: 1 }, { unique: true });

AccessTokenSchema.statics = {
  async findToken(authorizationToken) {
    if (authorizationToken) {
      let accessToken;
      if (!authorizationToken.includes("|")) {
        accessToken = await this.findOne({
          where: { token: hash(authorizationToken) },
          include: "owner",
        });
      } else {
        const [id, kToken] = authorizationToken.split("|", 2);
        const instance = await this.findByPk(id, { include: "owner" });
        if (instance) {
          accessToken = hash_compare(instance.token, hash(kToken))
            ? instance
            : null;
        }
      }

      if (!accessToken) return { user: null, currentAccessToken: null };

      accessToken.last_used_at = new Date(Date.now());
      await accessToken.save();
      return { user: accessToken.owner, currentAccessToken: accessToken.token };
    }

    return { user: null, currentAccessToken: null };
    try {
    } catch (error) {}
  },
  async register(args) {
    try {
      data = await this.create({
        ...args,
      });
      if (data) {
        return {
          success: true,
          data,
          message: "Token created",
        };
      }
      return {
        success: true,
        data,
        message: "operation successful but Token NOT successfully created",
      };
    } catch (err) {
      logObject("the error", err);
      let response = {};
      let message = "validation errors for some of the provided fields";
      let status = HTTPStatus.CONFLICT;
      if (err.keyValue) {
        Object.entries(err.keyValue).forEach(([key, value]) => {
          return (response[key] = `the ${key} must be unique`);
        });
      }

      return {
        error: response,
        message,
        success: false,
        status,
      };
    }
  },

  async list({ skip = 0, limit = 5, filter = {} } = {}) {
    try {
      let tokens = await this.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec();
      if (!isEmpty(tokens)) {
        let data = tokens;
        return {
          success: true,
          data,
          message: "successfully listed the tokens",
        };
      }

      if (isEmpty(data)) {
        return {
          success: true,
          message: "no tokens exist",
          data,
        };
      }
      return {
        success: false,
        message: "unable to retrieve tokens",
        data,
      };
    } catch (error) {
      return {
        success: false,
        message: "Token model server error - list",
        error: error.message,
      };
    }
  },
  async modify({ filter = {}, update = {} } = {}) {
    try {
      let options = { new: true };
      let modifiedUpdate = update;
      let updatedToken = await this.findOneAndUpdate(
        filter,
        modifiedUpdate,
        options
      ).exec();
      if (!isEmpty(updatedToken)) {
        let data = updatedToken._doc;
        return {
          success: true,
          message: "successfully modified the Token",
          data,
        };
      } else {
        return {
          success: false,
          message: "Token does not exist, please crosscheck",
        };
      }
    } catch (error) {
      return {
        success: false,
        message: "Token model server error - modify",
        error: error.message,
      };
    }
  },
  async remove({ filter = {} } = {}) {
    try {
      let options = {
        projection: { _id: 0, token: 1, userId: 1, expires_in: 1 },
      };
      let removedToken = await this.findOneAndRemove(filter, options).exec();

      if (!isEmpty(removedToken)) {
        let data = removedToken._doc;
        return {
          success: true,
          message: "successfully removed the Token",
          data,
        };
      } else {
        return {
          success: false,
          message: "Token does not exist, please crosscheck",
        };
      }
    } catch (error) {
      return {
        success: false,
        message: "Token model server error - remove",
        error: error.message,
      };
    }
  },
};

AccessTokenSchema.methods = {
  toJSON() {
    return {
      _id: this._id,
      token: this.token,
      userId: this.userId,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      name: this.name,
      last_used_at: this.last_used_at,
      last_ip_address: this.last_ip_address,
    };
  },
};

module.exports = AccessTokenSchema;
