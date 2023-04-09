import {info} from '@actions/core'
import {context} from '@actions/github'
import {GitHub, getOctokitOptions} from '@actions/github/lib/utils'
import {Label, LabelType, LogicalLabel} from './types'

async function getLabelsForRepo(token: string): Promise<Label[]> {
  const client = new GitHub(getOctokitOptions(token)).rest
  const {data} = await client.issues.listLabelsForRepo(context.repo)
  return data.map(
    label =>
      ({
        name: label.name,
        description: label.description,
        color: label.color
      } as Label)
  )
}

async function createOrUpdateLabels(
  token: string,
  labels: string
): Promise<Label[]> {
  const availableLabelsAtBegining: Label[] = await getLabelsForRepo(token)
  const requiredLabels: Label[] = parseLabelsFromFormattedString(labels)
  for (const label of requiredLabels) {
    createLabelIfNotPresent(token, label, availableLabelsAtBegining)
  }
  const availableLabelsAtEnd: Label[] = await getLabelsForRepo(token)
  return availableLabelsAtEnd
}

async function createLabelIfNotPresent(
  token: string,
  label: Label,
  currentLabels: Label[]
): Promise<Label | undefined> {
  if (
    !currentLabels.find(
      query => query.name.toLocaleLowerCase() === label.name.toLocaleLowerCase()
    )
  ) {
    const client = new GitHub(getOctokitOptions(token)).rest
    const {data} = await client.issues.createLabel({...context.repo, ...label})
    return data as Label
  }
  return undefined
}

const parseLabel = (formattedString: string): Label => {
  const [key, condition] = formattedString.split('=')
  const [name, color] = key.split('|')
  return {
    name,
    description: `PR-Labeler autogenerated ${name} label`,
    color
  } as Label
}

const parseLogicalLabel = (
  formattedString: string,
  labelType: LabelType
): LogicalLabel => {
  let [key, condition] = formattedString.split('=')
  const [name, color] = key.split('|')
  if (labelType === LabelType.SIZE && condition.length === 0)
    condition = Number.MAX_SAFE_INTEGER.toString()
  return {
    name,
    description: `PR-Labeler autogenerated ${name} label`,
    color,
    condition,
    type: labelType
  } as LogicalLabel
}

const parseLabelsFromFormattedString = (formattedString: string): Label[] => {
  return formattedString.split(',').map(v => parseLabel(v))
}

const parseLogicalLabelsFromFormattedString = (
  formattedString: string,
  labelType: LabelType
): LogicalLabel[] => {
  return formattedString.split(',').map(v => parseLogicalLabel(v, labelType))
}

const getLabelForLinesChanged = (
  linesChanged: number,
  sizeLabels: string
): Label | undefined => {
  const possibleLabels: LogicalLabel[] = parseLogicalLabelsFromFormattedString(
    sizeLabels,
    LabelType.SIZE
  )
  possibleLabels.sort((a, b) => parseInt(a.condition) - parseInt(b.condition))
  for (const label of possibleLabels) {
    info(`label: ${label.name}, condition: ${label.condition}`)
    if (parseInt(label.condition) < linesChanged) {
      return label
    }
  }
}

export const sizeLabelHandlers = {
  parseLabelsFromFormattedString,
  getLabelsForRepo,
  createOrUpdateLabels,
  getLabelForLinesChanged
}
