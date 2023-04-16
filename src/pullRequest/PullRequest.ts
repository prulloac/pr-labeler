import {context, getOctokit} from '@actions/github'
import {
  Condition,
  Conditions,
  ConditionalLabel,
  RepoLabel
} from '../labels/types'

type ClientType = ReturnType<typeof getOctokit>
interface FilesChanged {
  files: string[]
  quantity: number
}

export class PullRequest {
  number!: number
  title!: string
  body!: string
  filesChanged: FilesChanged = {quantity: 0, files: []}
  labels!: RepoLabel[]
  linesChanged!: number
  mergeable!: boolean
  rebaseable!: boolean
  author!: string
  client: ClientType

  constructor(client: ClientType) {
    this.client = client
    if (!context.payload.pull_request) {
      throw Error(
        'Cannot instantiate PullRequest if context is not pull_request'
      )
    }
    this.number = context.payload.pull_request.number
  }

  async load() {
    const {data: metaData} = await this.client.rest.pulls.get({
      ...context.repo,
      pull_number: this.number
    })
    this.body = `${metaData.body}`
    this.title = metaData.title
    this.linesChanged = metaData.additions + metaData.deletions
    this.labels = metaData.labels.map(v => ({
      name: v.name,
      color: v.color,
      description: v.description || undefined
    }))
    this.mergeable = metaData.mergeable ?? false
    this.rebaseable = metaData.rebaseable ?? false
    this.filesChanged.quantity = metaData.changed_files
    const {data: commitData} = await this.client.rest.pulls.listCommits({
      ...context.repo,
      pull_number: this.number
    })
    this.author = `${commitData[0].committer?.login}`
    const {data: filesData} = await this.client.rest.pulls.listFiles({
      ...context.repo,
      pull_number: this.number
    })
    this.filesChanged.files = filesData.map(fileData => fileData.filename)
  }

  async addLabel(label: RepoLabel) {
    await this.client.rest.issues.addLabels({
      ...context.repo,
      issue_number: this.number,
      labels: [label.name]
    })
  }

  checkCondition(condition: Condition): boolean {
    if (condition instanceof Conditions.MaxLinesCondition) {
      return this.linesChanged < condition.maxLines
    }
    if (condition instanceof Conditions.MinLinesCondition) {
      return this.linesChanged >= condition.minLines
    }
    if (condition instanceof Conditions.MaxFilesCondition) {
      return this.linesChanged < condition.maxFiles
    }
    if (condition instanceof Conditions.MinFilesCondition) {
      return this.linesChanged >= condition.minFiles
    }
    return false
  }

  async apply(config: ConditionalLabel[]) {
    for (const label of config) {
      if (label.conditions.every(this.checkCondition)) {
        await this.addLabel(label as RepoLabel)
      }
    }
  }
}
