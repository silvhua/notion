const {getCurrentTimestamp, loadJsonFile, saveResponseJson} = require('./fileFunctions')
const { Client } = require('@notionhq/client');
const fs = require('fs');

console.log(`Current time stamp: ${getCurrentTimestamp()}`);

async function queryNotionAndSaveResponse(
  period='week', jsonFileName='../data/notion_time_tracking', save = true, appendTimestamp = true) {
  let notionApiKey = process.env.notion_secret;
  let notion = new Client({ auth: notionApiKey });

  if (period == 'past_week') {
    date_filter = {
      property: 'Created time',
      date: {past_week: {}},
    };
  } else if (period == 'quarter') {
    let start = getTimestamp('month', nMonths = 3);
    console.log(`Start date: ${start}. Period: ${period}`);
    date_filter = {
      and: [
        {property: 'Created time', date: {on_or_after: start}},
        {property: 'Created time', date: {before: addTimeDelta(start, period='month', nPeriod=3)}}
      ]
    };
  } else if (period == 'month' || period == 'week') {
      start = getTimestamp(period)
      date_filter = {
        and: [
          {property: 'Created time', date: {on_or_after: start}},
          {property: 'Created time', date: {before: addTimeDelta(start, period=period, nPeriod=1)}}
        ]
      };
  };
  
  let response = await notion.databases.query({
    database_id: process.env.notion_database,
    filter: date_filter
  });


  if (save) {
    // Add timestamp to the file name if appendTimestamp is true
    if (appendTimestamp) {
      const timestamp = getCurrentTimestamp();
      jsonFileName = `${jsonFileName}_${timestamp}`;
    }

    // Save the response as a JSON file
    await fs.writeFile(`${jsonFileName}.json`, JSON.stringify(response, null, 2));

    console.log(`Response saved to ${jsonFileName}.json`);
  }
  return response
}
  


/**
 * Converts a given date string to an ISO timestamp.
 *
 * @param {string} dateString - The date string to convert.
 * @return {string} The converted ISO timestamp.
 */
function getIsoTimestamp(dateString) {
    const date = new Date(dateString);
    const timestamp = date.toISOString();
    return timestamp;
  }

/**
 * Returns a timestamp based on the given option.
 *
 * @param {string} option - The option to determine the timestamp. Possible values are 'week', 'lastWeek', 'month', 'months'.
 * @param {number} [nMonths=1] - The number of months to go back if the option is 'months'.
 * @return {string|null} - The timestamp in ISO string format if the option is valid, otherwise null.
 */
function getTimestamp(option, nMonths = 1) {
  const now = new Date();

  if (option == 'week') {
    const dayOfWeek = now.getDay();
    const daysSinceLastMonday = (dayOfWeek + 6) % 7;
    const startOfLastMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysSinceLastMonday);
    return startOfLastMonday.toISOString();
  }

  if (option == 'lastWeek') {
    const mondayOfLastWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7 - ((now.getDay() + 6) % 7));
    return mondayOfLastWeek.toISOString();
  }

  // if (option == 'month') {
  //   const startOfPreviousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  //   return startOfPreviousMonth.toISOString();
  // }

  if (option == 'month') {
    const startOfNMonthsAgo = new Date(now.getFullYear(), now.getMonth() - nMonths, 1);
    return startOfNMonthsAgo.toISOString();
  }
}

/**
 * Adds a time delta to a given timestamp and returns the updated timestamp.
 *
 * @param {string} timestamp - The timestamp to which the time delta should be added. Defaults to the current timestamp.
 * @param {string} period - The period of the time delta. Can be 'day', 'week', or 'month'. Defaults to 'week'.
 * @param {number} nPeriod - The number of periods to add to the timestamp. Defaults to 1.
 * @return {string} - The updated timestamp in ISO 8601 format.
 */
function addTimeDelta(timestamp=new Date().toISOString(), period='week', nPeriod=1) {
  const date = new Date(timestamp);

  if (period === 'day') {
    date.setDate(date.getDate() + nPeriod);
  } else if (period === 'week') {
    date.setDate(date.getDate() + nPeriod * 7);
  } else if (period === 'month') {
    date.setMonth(date.getMonth() + nPeriod);
  }

  return date.toISOString();
}

async function retrievePage(
  pageId, jsonFileName='../data/notion_page', save = true, appendTimestamp = true
) {
  const { Client } = require('@notionhq/client');
  const fs = require('fs');
  let notionApiKey = process.env.notion_secret;
  let notion = new Client({ auth: notionApiKey });
    try {
      const response = await notion.pages.retrieve({ page_id: pageId });
      if (save) {
        await saveResponseJson(response, jsonFileName, appendTimestamp);
      }
      return response;
    } catch (error) {
      console.error(error);
      throw error;
    }
}

async function parsePage(response) {
  try {
      const data = await response;
      const parsed_data = {};
      parsed_data['Name'] = data['properties']['Name']['title'][0]['plain_text'];
      const multi_select_rollups = [
          'Project tags', 
      ]
      for (let i = 0; i < multi_select_rollups.length; i++) {
          const rollup = multi_select_rollups[i];
          parsed_data[rollup] = data['properties'][rollup]['rollup']['array'][0]['multi_select'].map(item => item['name']);
      }
      const relations = ['Project', 'Parent-task', 'Sub-tasks'];
      for (let i = 0; i < relations.length; i++) {
          const relation = relations[i];
          //  Only parse relation if it is greater than 0
          if (data['properties'][relation]['relation'].length === 0) {
              parsed_data[relation] = null;
          } else {
              parsed_data[relation] = data['properties'][relation]['relation'][0]['id'];
          };
      }
      return parsed_data
  } catch (error) {
      console.log(`Error: ${error}`);
  };
}

function parseTimeTracking(
  data, save = false, jsonFileName='../data/notion_time_tracking_parsed', appendTimestamp = true
  ) {
  const parsed_data = {};
  const relations_list = ['Tasks'];
  const array_types = ['multi_select', 'relation']
  let properties =  Object.keys(data[0]['properties'])
  const to_ignore = [
          'Created time', 'Start min', 'summary', 'End min', 'follow up task', 'URL', 'End hr', 
          'Start hr', 'Name', 'Projects', 'Project tag', 'Project (Rollup)'
      ]
  properties = properties.filter(item => !to_ignore.includes(item))
  for (let i = 0; i < 3; i++) {
  // for (let i = 0; i < data.length; i++) {
      const item = data[i];
      const id = item['id']
      record = {};
      for (let j = 0; j < properties.length; j++) {
          const property = properties[j];
          const property_dict = data[i]['properties'][property];
          // console.log(property_dict)
          const property_type = property_dict['type'];
          // console.log(property)
          if (property_type == 'relation') {
              //  Only parse relation if it is greater than 0
              if (property_dict[property_type].length === 0) {
                  record[property] = null;
              } else {
                  record[property] = property_dict[property_type].map(item => item['id']);
                  if (property == 'Tasks') {
                      console.log('Parsing task details');
                      // record['Task details'] = property_dict[property_type].map(item => parsePage(item['id']));
                      //  Convert Promise object to string
                      record['Task details'] = property_dict[property_type].map(async item => await parsePage(item['id']));
                      
                  }
              };
          } else if (property_type == 'rollup') {
              rollup_type = property_dict[property_type]['type'];
              if (rollup_type == 'array' && property_dict[property_type]['array'].length > 0) {
                  var array_type = property_dict[property_type]['array'][0]['type'];
                  if (array_type == 'multi_select' || array_type == 'relation') {
                      record[property] = property_dict[property_type]['array'][0][array_type].map(item => item['name']);
                  } else {
                      record[property] = null
                  };
              } else {
                  record[property] = null
              }
          } else if (property_type == 'rich_text') {
              if (property_dict[property_type].length > 0) {
                  record[property] = property_dict[property_type][0]['text']['content'];
              } else {
                  record[property] = null;
              };
          } else if (property_type == 'rich_text') {
              if (property_dict[property_type].length > 0) {
                  record[property] = property_dict[property_type][0]['text']['content'];
              } else {
                  record[property] = null;
              };
          } else if (property_type == 'formula') {
              formula_type = property_dict[property_type]['type'];
              record[property] = property_dict[property_type][formula_type];
          } else if (property_type == 'multi_select') {
              if (property_dict[property_type].length > 0) {
                  record[property] = property_dict[property_type].map(item => item);
              } else {
                  record[property] = null;
              }
          } else {
              console.log(`Property of type ${property_type} was not parsed: ${property}`);
          }
          
      parsed_data[id] = record
      }
  }
  if (save) {
      saveResponseJson(parsed_data, jsonFileName, appendTimestamp);
  };
  return parsed_data;
}