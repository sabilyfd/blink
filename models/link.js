const BaseModel = require('./base')
const hashId = require('objection-hashid')
const httpError = require('http-errors')
const camelCase = require('lodash/camelCase')

const { URL } = require('url')
const normalizeURL = require('normalize-url')
const domain = new URL(process.env.BASE_URL).host

class Link extends hashId(BaseModel) {
  static get relationMappings() {
    return {
      user: {
        type: BaseModel.BelongsToOneRelation,
        modelClass: 'user',
        join: {
          from: 'links.creatorId',
          to: 'users.id'
        }
      }
    }
  }

  processInput() {
    if (this.hash) {
      // We want custom hash to be case-insensitive.
      // However, we can't realistically check ALL combinations of
      // a custom hash (e.g. Hello/hEllo/hellO/etc).
      // So, the compromise is that custom hash is ALWAYS converted to camelCase.
      // And then, since custom and auto-generated hash are both mounted under /,
      // we need to check that custom hash CAN'T clash with autogenerated hash.
      this.hash = camelCase(this.hash)
      const ids = this.constructor._hashIdInstance.decode(this.hash)
      if (ids.length) throw httpError(400, 'Cannot use hash ' + this.hash)
    }
    if (this.originalURL) {
      try {
        // normalize URL so that we can search by URL.
        // The process of normalization also involves validating the (normalized) URL.
        this.originalURL = normalizeURL(this.originalURL, { forceHttps: true })

        if (new URL(this.originalURL).host === domain)
          throw new Error(`Cannot shorten ${domain} URLs`)
      } catch (err) {
        throw httpError(400, err)
      }
    }
  }

  static get virtualAttributes() {
    return ['shortenedURL', 'brandedURL']
  }

  get shortenedURL() {
    return `${process.env.BASE_URL}/${this.hashId}`
  }

  get brandedURL() {
    return `${process.env.BASE_URL}/${this.hash}`
  }

  static get hashIdSalt() {
    return domain
  }

  static get hashIdMinLength() {
    return this.jsonSchema.properties.hash.minLength
  }

  static get QueryBuilder() {
    return class extends super.QueryBuilder {
      // if the hash is encoded, search for the id, else search hash directly
      findByHashId(hash) {
        const ids = this.modelClass()._hashIdInstance.decode(hash)

        return ids.length ? this.findById(ids[0]) : this.findOne({ hash })
      }

      // find by the normalized form
      findByURL(url) {
        return this.findOne({
          originalURL: normalizeURL(url, { forceHttps: true })
        })
      }
    }
  }
}

module.exports = Link
